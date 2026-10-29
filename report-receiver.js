
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.REPORT_PORT) || 4000;
const TOKEN = process.env.REPORT_TOKEN;
const REPORT_FILE = path.join(__dirname, 'test-report.json');
const MAX_BODY_SIZE = 1_000_000;

function sendJson(res, status, data) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(JSON.stringify(data, null, 2));
}

function tokenMatches(received) {
    if (!TOKEN || typeof received !== 'string') {
        return false;
    }

    const expectedBuffer = Buffer.from(TOKEN);
    const receivedBuffer = Buffer.from(received);

    return expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function isValidReport(report) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
        return false;
    }

    const requiredStrings = [
        'repository',
        'branch',
        'commitSha',
        'pipelineRunId',
        'executionTimestamp',
        'overallStatus'
    ];

    if (!requiredStrings.every(key =>
        typeof report[key] === 'string' && report[key].length > 0
    )) {
        return false;
    }

    if (!['passed', 'failed'].includes(report.overallStatus)) {
        return false;
    }

    if (
        !Array.isArray(report.tests) ||
        !report.counts ||
        typeof report.counts !== 'object'
    ) {
        return false;
    }

    const { total, passed, failed } = report.counts;

    if (
        !Number.isInteger(total) ||
        !Number.isInteger(passed) ||
        !Number.isInteger(failed) ||
        total !== report.tests.length ||
        passed < 0 ||
        failed < 0 ||
        passed + failed !== total
    ) {
        return false;
    }

    return report.tests.every(test =>
        test &&
        typeof test.name === 'string' &&
        ['passed', 'failed', 'skipped'].includes(test.result) &&
        (
            test.failureMessage === null ||
            typeof test.failureMessage === 'string'
        )
    );
}

const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/report') {
        return sendJson(res, 404, {
            error: 'Not found. POST reports to /report.'
        });
    }

    if (!tokenMatches(req.headers['x-report-token'])) {
        return sendJson(res, 401, {
            error: 'Unauthorized report request.'
        });
    }

    let body = '';
    let size = 0;
    let tooLarge = false;

    req.on('data', chunk => {
        size += chunk.length;

        if (size > MAX_BODY_SIZE) {
            tooLarge = true;
            body = '';
            return;
        }

        if (!tooLarge) {
            body += chunk.toString('utf8');
        }
    });

    req.on('end', () => {
        if (tooLarge) {
            return sendJson(res, 413, {
                error: 'Report is too large.'
            });
        }

        try {
            const report = JSON.parse(body);

            if (!isValidReport(report)) {
                return sendJson(res, 400, {
                    error: 'Report structure is invalid.'
                });
            }

            // Write atomically so an interrupted write does not
            // leave a partially written JSON report.
            const tempFile = REPORT_FILE + '.tmp';

            fs.writeFileSync(
                tempFile,
                JSON.stringify(report, null, 2),
                'utf8'
            );

            fs.renameSync(tempFile, REPORT_FILE);

            console.log('Test report received successfully.');
            console.log(`Repository: ${report.repository}`);
            console.log(`Commit: ${report.commitSha}`);
            console.log(`Status: ${report.overallStatus}`);
            console.log(
                `Tests: ${report.counts.passed} passed, ` +
                `${report.counts.failed} failed`
            );
            console.log(`Saved to: ${REPORT_FILE}`);

            return sendJson(res, 201, {
                message: 'Test report saved successfully.',
                file: path.basename(REPORT_FILE)
            });
        } catch {
            return sendJson(res, 400, {
                error: 'Invalid JSON report.'
            });
        }
    });

    req.on('error', () => {
        if (!res.writableEnded) {
            sendJson(res, 400, { error: 'Could not read request.' });
        }
    });
});

if (require.main === module) {
    if (!TOKEN || TOKEN.length < 32) {
        console.error(
            'Set REPORT_TOKEN to a secret of at least 32 characters before starting.'
        );
        process.exitCode = 1;
    } else {
        server.listen(PORT, '127.0.0.1', () => {
            console.log('==========================================');
            console.log('  CSC418 Local Test Report Receiver');
            console.log(`  Listening on http://127.0.0.1:${PORT}`);
            console.log('  Endpoint: POST /report');
            console.log('  Output: test-report.json');
            console.log('==========================================');
        });
    }
}

module.exports = { server, isValidReport, REPORT_FILE };
