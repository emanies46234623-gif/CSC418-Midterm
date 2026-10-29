
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = __dirname;
const REPORT_FILE = path.join(ROOT, 'test-report.json');

function gitValue(args, fallback) {
    try {
        return execFileSync('git', args, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim() || fallback;
    } catch {
        return fallback;
    }
}

function parseTestResults(output) {
    const results = [];

    for (const line of output.split(/\r?\n/)) {
        const match = line.trim().match(
            /^(ok|not ok)\s+\d+\s+-\s+(.+)$/
        );

        if (!match) continue;

        let name = match[2].replace(/\s+#\s*(?:SKIP|TODO)\b.*$/i, '').trim();

        // Node's TAP reporter can include the test filename as a
        // parent result. We only want the individual test cases.
        if (/^app\.test\.js(?:\s|$)/i.test(name)) continue;

        // Ignore unrelated reporter summary lines.
        if (!name || /^tests?\s+\d+$/i.test(name)) continue;

        const skipped = /\s+#\s*SKIP\b/i.test(match[2]);

        results.push({
            name,
            result: skipped
                ? 'skipped'
                : match[1] === 'ok'
                    ? 'passed'
                    : 'failed',
            failureMessage: match[1] === 'not ok'
                ? output.slice(0, 6000)
                : null
        });
    }

    return results;
}

async function main() {
    console.log('Running automated assignment portal tests...\n');

    const execution = spawnSync(
        process.execPath,
        [
            '--test',
            '--test-reporter=tap',
            'app.test.js'
        ],
        {
            cwd: ROOT,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 120000
        }
    );

    const output = [
        execution.stdout || '',
        execution.stderr || '',
        execution.error ? execution.error.message : ''
    ].filter(Boolean).join('\n');

    process.stdout.write(output);

    let tests = parseTestResults(output);

    // If Node cannot load or execute the test file, still report
    // the failure instead of producing an empty, successful report.
    if (tests.length === 0) {
        tests = [{
            name: 'Test runner execution',
            result: 'failed',
            failureMessage: output.slice(0, 6000) ||
                'The test runner produced no test results.'
        }];
    }

    const passed = tests.filter(test => test.result === 'passed').length;
    const failed = tests.filter(test => test.result === 'failed').length;
    const skipped = tests.filter(test => test.result === 'skipped').length;

    // The receiver's current schema expects total = passed + failed.
    // If there are skipped tests, record them as failures for this
    // report rather than claiming that all tests passed.
    if (skipped > 0) {
        for (const test of tests) {
            if (test.result === 'skipped') {
                test.result = 'failed';
                test.failureMessage =
                    'Test was skipped; this lab requires executed test results.';
            }
        }
    }

    const finalPassed = tests.filter(
        test => test.result === 'passed'
    ).length;

    const finalFailed = tests.filter(
        test => test.result === 'failed'
    ).length;

    // Include a runner-level failure if the process failed even
    // though all reported individual test cases appeared to pass.
    if (execution.error || execution.status !== 0) {
        if (finalFailed === 0) {
            tests.push({
                name: 'Test runner process',
                result: 'failed',
                failureMessage: execution.error
                    ? execution.error.message
                    : `Test runner exited with code ${execution.status}.`
            });
        }
    }

    const counts = {
        total: tests.length,
        passed: tests.filter(test => test.result === 'passed').length,
        failed: tests.filter(test => test.result === 'failed').length
    };

    const report = {
        repository: process.env.GITHUB_REPOSITORY ||
            'emanies46234623-gif/CSC418-Midterm',

        branch: process.env.GITHUB_REF_NAME ||
            gitValue(['branch', '--show-current'], 'local'),

        commitSha: process.env.GITHUB_SHA ||
            gitValue(['rev-parse', 'HEAD'], 'unknown'),

        pipelineRunId: process.env.GITHUB_RUN_ID ||
            `local-${Date.now()}`,

        executionTimestamp: new Date().toISOString(),

        tests,

        counts,

        overallStatus: (
            execution.status === 0 &&
            !execution.error &&
            counts.failed === 0
        ) ? 'passed' : 'failed'
    };

    fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify(report, null, 2),
        'utf8'
    );

    console.log('\n======================================');
    console.log('Test report generated');
    console.log(`Total tests: ${counts.total}`);
    console.log(`Passed: ${counts.passed}`);
    console.log(`Failed: ${counts.failed}`);
    console.log(`Overall result: ${report.overallStatus}`);
    console.log(`Report file: ${REPORT_FILE}`);
    console.log('======================================');

    // Send the report if a receiver URL and token are configured.
    const receiverUrl = process.env.REPORT_URL;
    const receiverToken = process.env.REPORT_TOKEN;
    let deliveryFailed = false;

    if (receiverUrl && receiverToken) {
        try {
            const response = await fetch(receiverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-report-token': receiverToken
                },
                body: JSON.stringify(report),
                signal: AbortSignal.timeout(15000)
            });

            const responseText = await response.text();

            if (!response.ok) {
                deliveryFailed = true;
                console.error(
                    `Report delivery failed: HTTP ${response.status}`
                );
                console.error(responseText);
            } else {
                console.log('Report successfully delivered to receiver.');
                console.log(responseText);
            }
        } catch (error) {
            deliveryFailed = true;
            console.error('Could not deliver the report:', error.message);
        }
    } else {
        console.log(
            'Receiver is not configured yet. Report was saved locally only.'
        );
    }

    // A failed test must always make the command fail.
    if (report.overallStatus !== 'passed' || deliveryFailed) {
        process.exitCode = 1;
    }
}

main().catch(error => {
    console.error('Report generation failed:', error);
    process.exitCode = 1;
});
