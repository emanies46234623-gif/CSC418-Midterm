
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
    server,
    DATA_FILE,
    getSubmissions,
    saveSubmissions
} = require('./app');

let originalData;
let baseUrl;

before(async () => {
    // Back up existing records before running tests.
    originalData = fs.readFileSync(DATA_FILE);
    saveSubmissions([]);

    // Use a temporary free port, not port 3000.
    await new Promise((resolve, reject) => {
        const onError = error => {
            server.off('listening', onListening);
            reject(error);
        };

        const onListening = () => {
            server.off('error', onError);
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        };

        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(0, '127.0.0.1');
    });
});

after(async () => {
    if (server.listening) {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }

    // Restore the records that existed before testing.
    if (originalData) {
        fs.writeFileSync(DATA_FILE, originalData);
    }
});

async function submitAssignment(data) {
    return fetch(`${baseUrl}/submit`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams(data),
        redirect: 'manual'
    });
}

// TEST 1: A complete, valid submission is saved and displayed.
test('Valid submission is saved and displayed', async () => {
    const response = await submitAssignment({
        name: 'Aisha Khan',
        registrationNumber: 'FA24-BSE-017',
        assignmentTitle: 'DevOps Assignment',
        submissionUrl: 'https://example.com/assignment'
    });

    assert.equal(response.status, 303);

    const records = getSubmissions();

    assert.equal(records.length, 1);
    assert.equal(records[0].name, 'Aisha Khan');
    assert.equal(records[0].registrationNumber, 'FA24-BSE-017');
    assert.equal(records[0].assignmentTitle, 'DevOps Assignment');

    const page = await fetch(`${baseUrl}/?submitted=1`);
    const html = await page.text();

    assert.equal(page.status, 200);
    assert.match(html, /Aisha Khan/);
    assert.match(html, /DevOps Assignment/);
});

// TEST 2: Missing registration number is rejected.
test('Missing registration number is rejected', async () => {
    const countBefore = getSubmissions().length;

    const response = await submitAssignment({
        name: 'Ali Ahmed',
        registrationNumber: '',
        assignmentTitle: 'Database Assignment',
        submissionUrl: 'https://example.com/database'
    });

    assert.equal(response.status, 400);

    const html = await response.text();

    assert.match(html, /Registration number is required/);
    assert.equal(getSubmissions().length, countBefore);
});

// TEST 3: Invalid URL is rejected and not saved.
test('Invalid submission URL is rejected and not saved', async () => {
    const countBefore = getSubmissions().length;

    const response = await submitAssignment({
        name: 'Sara Malik',
        registrationNumber: 'FA24-BSE-018',
        assignmentTitle: 'Networking Assignment',
        submissionUrl: 'not-a-valid-url'
    });

    assert.equal(response.status, 400);

    const html = await response.text();

    assert.match(html, /valid HTTP or HTTPS URL/);
    assert.equal(getSubmissions().length, countBefore);
});
