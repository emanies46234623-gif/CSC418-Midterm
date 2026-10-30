
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');
const MAX_BODY_SIZE = 100_000;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');


function saveSubmissions(records) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), 'utf8');
}

function validateSubmission(data = {}) {
    const submission = {
        name: String(data.name || '').trim(),
        registrationNumber: String(data.registrationNumber || '').trim(),
        assignmentTitle: String(data.assignmentTitle || '').trim(),
        submissionUrl: String(data.submissionUrl || '').trim()
    };

    const errors = [];

    if (!submission.name) {
        errors.push('Student full name is required.');
    } else if (submission.name.length > 120) {
        errors.push('Student name must be 120 characters or fewer.');
    }

    if (!submission.registrationNumber) {
        errors.push('Registration number is required.');
    } else if (submission.registrationNumber.length > 60) {
        errors.push('Registration number must be 60 characters or fewer.');
    }

    if (!submission.assignmentTitle) {
        errors.push('Assignment title is required.');
    } else if (submission.assignmentTitle.length > 200) {
        errors.push('Assignment title must be 200 characters or fewer.');
    }

    if (!submission.submissionUrl) {
        errors.push('Submission URL is required.');
    } else if (submission.submissionUrl.length > 2048) {
        errors.push('Submission URL must be 2,048 characters or fewer.');
    } else {
        try {
            const parsed = new URL(submission.submissionUrl);
            const validProtocol = ['http:', 'https:'].includes(parsed.protocol);
            const host = parsed.hostname;

            const validHost =
                host.includes('.') &&
                !host.startsWith('.') &&
                !host.endsWith('.') &&
                !host.includes(' ');

            if (!validProtocol || !validHost) {
                errors.push('Enter a valid HTTP or HTTPS URL.');
            }
        } catch {
            errors.push('Enter a valid HTTP or HTTPS URL.');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        submission
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function renderPage({ message = '', isError = false } = {}) {
    const submissions = getSubmissions().slice().reverse();
    const total = submissions.length;

    const uniqueStudents = new Set(
        submissions.map(item =>
            String(item.registrationNumber || '').toLowerCase()
        )
    ).size;

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const recentCount = submissions.filter(item =>
        item.submittedAt &&
        new Date(item.submittedAt).getTime() >= weekAgo
    ).length;

    const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    const rows = submissions.map((item, index) => {
        const searchText = [
            item.name,
            item.registrationNumber,
            item.assignmentTitle,
            item.submissionUrl
        ].join(' ').toLowerCase();

        const initial = String(item.name || '?')
            .trim()
            .charAt(0)
            .toUpperCase();

        return `
            <tr data-submission-row
                data-search="${escapeHtml(searchText)}">
                <td class="number-cell">
                    ${String(total - index).padStart(2, '0')}
                </td>

                <td>
                    <div class="student-cell">
                        <span class="student-avatar">
                            ${escapeHtml(initial)}
                        </span>

                        <span class="student-detail">
                            <strong>${escapeHtml(item.name)}</strong>
                            <small>${escapeHtml(item.registrationNumber)}</small>
                        </span>
                    </div>
                </td>

                <td>
                    <span class="assignment-title">
                        ${escapeHtml(item.assignmentTitle)}
                    </span>
                </td>

                <td>
                    <a class="table-link"
                       href="${escapeHtml(item.submissionUrl)}"
                       target="_blank"
                       rel="noopener noreferrer">
                       Open link ↗
                    </a>
                </td>

                <td>
                    <span class="status-pill">
                        <span class="status-dot"></span>
                        Submitted
                    </span>

                    <small class="date-text">
                        ${escapeHtml(formatDate(item.submittedAt))}
                    </small>
                </td>
            </tr>`;
    }).join('');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#101b3d">
<meta name="description"
      content="A modern student assignment submission portal.">

<title>Submitly — Student Workspace</title>

<style>
:root {
    color-scheme: light;
    --ink: #18213b;
    --navy: #101b3d;
    --blue: #536dfe;
    --blue-dark: #4057e8;
    --blue-wash: #eff2ff;
    --slate: #66718a;
    --muted: #8b95aa;
    --line: #e7ebf3;
    --canvas: #f5f7fb;
    --white: #ffffff;
    --green: #15804b;
    --green-wash: #eaf8f0;
    --red: #a52c45;
    --red-wash: #fff0f3;
    --shadow: 0 10px 34px rgba(21,37,78,.045);
}

* {
    box-sizing: border-box;
}

html {
    scroll-behavior: smooth;
}

body {
    margin: 0;
    background: var(--canvas);
    color: var(--ink);
    font: 14px/1.55 "Segoe UI", Arial, sans-serif;
}

a {
    color: inherit;
}

button,
input {
    font: inherit;
}

.sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 5;
    width: 244px;
    display: flex;
    flex-direction: column;
    padding: 25px 16px 18px;
    color: #dbe3ff;
    background: var(--navy);
    border-right: 1px solid #ffffff0c;
}

.brand {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 0 10px 31px;
    text-decoration: none;
}

.brand-mark {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    color: #fff;
    border-radius: 13px;
    background: linear-gradient(145deg,#7185ff,#435af0);
    font-size: 22px;
    font-weight: 900;
    box-shadow: 0 8px 20px #536dfe32;
}

.brand-name {
    display: block;
    color: #fff;
    font-size: 19px;
    font-weight: 850;
    letter-spacing: -.7px;
    line-height: 1.15;
}

.brand-caption {
    display: block;
    margin-top: 4px;
    color: #9eabd2;
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 700;
}

.nav-label {
    padding: 0 12px;
    margin: 5px 0 11px;
    color: #7583ad;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.6px;
    text-transform: uppercase;
}

.nav-list {
    display: grid;
    gap: 6px;
}

.nav-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    color: #aeb9dc;
    text-decoration: none;
    border: 1px solid transparent;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 650;
    transition: .18s ease;
}

.nav-link:hover,
.nav-link.active {
    color: #fff;
    background: #ffffff0d;
    border-color: #ffffff0b;
}

.nav-link.active {
    box-shadow: inset 3px 0 #8393ff;
}

.nav-icon {
    width: 20px;
    text-align: center;
    font-size: 17px;
}

.sidebar-spacer {
    flex: 1;
}

.sidebar-note {
    padding: 15px;
    border: 1px solid #ffffff17;
    border-radius: 12px;
    background: #ffffff08;
}

.sidebar-note-icon {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    margin-bottom: 11px;
    border-radius: 9px;
    color: #cdd6ff;
    background: #ffffff13;
}

.sidebar-note strong {
    display: block;
    color: #fff;
    font-size: 11px;
}

.sidebar-note p {
    margin: 5px 0 0;
    color: #9eabd2;
    font-size: 10px;
    line-height: 1.6;
}

.sidebar-footer {
    padding: 17px 10px 0;
    color: #7381aa;
    font-size: 10px;
}

.workspace {
    min-height: 100vh;
    margin-left: 244px;
}

.topbar {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 4.2%;
    background: #fff;
    border-bottom: 1px solid var(--line);
}

.breadcrumb {
    color: var(--muted);
    font-size: 11px;
}

.breadcrumb strong {
    color: #3d4962;
}

.topbar-right {
    display: flex;
    align-items: center;
    gap: 11px;
}

.local-indicator {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: #59657d;
    background: #fff;
    font-size: 10px;
    font-weight: 700;
}

.live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #21a464;
    box-shadow: 0 0 0 3px #21a46417;
}

.profile-avatar {
    display: grid;
    place-items: center;
    width: 35px;
    height: 35px;
    border-radius: 11px;
    background: #edf0ff;
    color: #4255cb;
    font-size: 11px;
    font-weight: 850;
}

.main-content {
    width: min(1390px, 94%);
    margin: 0 auto;
    padding: 31px 0 28px;
}

.page-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 22px;
}

.eyebrow {
    color: var(--blue);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 1.8px;
    text-transform: uppercase;
}

h1 {
    margin: 7px 0 6px;
    color: var(--navy);
    font-size: clamp(26px,2.7vw,34px);
    letter-spacing: -1.2px;
    line-height: 1.2;
}

.subtitle {
    margin: 0;
    color: var(--slate);
    font-size: 12px;
}

.date-chip {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    color: #606c84;
    background: #fff;
    font-size: 10px;
}

.hero {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    min-height: 174px;
    padding: 27px 30px;
    border-radius: 16px;
    color: #fff;
    background: linear-gradient(
        112deg,
        #111d42 0%,
        #202f72 56%,
        #5269ee 100%
    );
    box-shadow: 0 13px 30px #243d931a;
}

.hero-copy {
    position: relative;
    z-index: 1;
    max-width: 650px;
}

.hero-kicker {
    color: #bbc8ff;
    font-size: 9px;
    font-weight: 850;
    letter-spacing: 1.8px;
    text-transform: uppercase;
}

.hero h2 {
    margin: 8px 0;
    font-size: clamp(21px,2.2vw,27px);
    letter-spacing: -.75px;
    line-height: 1.25;
}

.hero p {
    max-width: 590px;
    margin: 0;
    color: #dbe2ff;
    font-size: 12px;
    line-height: 1.8;
}

.hero-art {
    position: absolute;
    right: 32px;
    top: 50%;
    width: 150px;
    height: 150px;
    transform: translateY(-50%);
    border: 1px solid #ffffff24;
    border-radius: 38px;
    background: linear-gradient(145deg,#ffffff0c,#ffffff03);
    rotate: 12deg;
}

.hero-art:before,
.hero-art:after {
    content: "";
    position: absolute;
    border: 1px solid #ffffff26;
    border-radius: 25px;
    inset: 19px;
}

.hero-art:after {
    inset: 39px;
    border-radius: 17px;
    background: #ffffff0c;
}

.hero-art span {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 49px;
    font-weight: 300;
}

.stats {
    display: grid;
    grid-template-columns: repeat(3,minmax(0,1fr));
    gap: 14px;
    margin: 17px 0 24px;
}

.stat-card {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 91px;
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
    box-shadow: var(--shadow);
}

.stat-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 12px;
    color: var(--blue);
    background: var(--blue-wash);
    font-size: 19px;
}

.stat-label {
    color: var(--muted);
    font-size: 10px;
}

.stat-value {
    margin-top: 1px;
    color: var(--navy);
    font-size: 24px;
    font-weight: 850;
    letter-spacing: -.6px;
    line-height: 1.35;
}

.stat-foot {
    margin-top: 1px;
    color: #8a95aa;
    font-size: 9px;
}

.content-grid {
    display: grid;
    grid-template-columns: minmax(300px,.92fr) minmax(250px,.62fr);
    gap: 17px;
    align-items: stretch;
}

.card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 13px;
    background: #fff;
    box-shadow: var(--shadow);
}

.card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 13px;
    padding: 19px 21px 16px;
    border-bottom: 1px solid var(--line);
}

.card-header h2 {
    margin: 0;
    color: var(--navy);
    font-size: 14px;
    letter-spacing: -.2px;
}

.card-header p {
    margin: 5px 0 0;
    color: var(--muted);
    font-size: 10px;
}

.step-chip {
    flex-shrink: 0;
    padding: 5px 8px;
    border-radius: 6px;
    color: #4d5fd0;
    background: var(--blue-wash);
    font-size: 9px;
    font-weight: 850;
}

.form-body {
    padding: 19px 21px 21px;
}

.message {
    margin-bottom: 16px;
    padding: 11px 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 11px;
}

.message.error {
    color: var(--red);
    background: var(--red-wash);
    border-color: #ffd5de;
}

.message.success {
    color: #16633c;
    background: var(--green-wash);
    border-color: #c9efd6;
}

.field {
    margin-bottom: 14px;
}

label {
    display: block;
    margin-bottom: 6px;
    color: #35415a;
    font-size: 11px;
    font-weight: 750;
}

.required {
    color: #e05268;
}

input {
    width: 100%;
    min-width: 0;
    min-height: 42px;
    padding: 10px 11px;
    color: var(--ink);
    background: #fff;
    border: 1px solid #dfe4ef;
    border-radius: 8px;
    outline: none;
    font: inherit;
    font-size: 11px;
    transition: border-color .16s, box-shadow .16s;
}

input::placeholder {
    color: #a2acbe;
}

input:focus {
    border-color: #8494ff;
    box-shadow: 0 0 0 3px #536dfe19;
}

.field-help {
    display: block;
    margin-top: 5px;
    color: #8994a8;
    font-size: 9px;
}

.submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    min-height: 44px;
    margin-top: 3px;
    padding: 10px 14px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background: var(--blue);
    box-shadow: 0 6px 14px #536dfe2a;
    cursor: pointer;
    font-size: 11px;
    font-weight: 800;
    transition: .16s ease;
}

.submit-btn:hover {
    background: var(--blue-dark);
    transform: translateY(-1px);
}

.submit-btn:focus-visible {
    outline: 3px solid #b7c0ff;
    outline-offset: 2px;
}

.secure-note {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 12px;
    color: #8d97aa;
    font-size: 9px;
}

.guide-body {
    padding: 20px;
}

.guide-intro {
    margin: 0 0 17px;
    color: var(--slate);
    font-size: 11px;
    line-height: 1.75;
}

.guide-item {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 13px 0;
    border-top: 1px solid #eef1f7;
}

.guide-number {
    display: grid;
    place-items: center;
    width: 29px;
    height: 29px;
    flex: 0 0 29px;
    border-radius: 9px;
    color: #4e60d1;
    background: var(--blue-wash);
    font-size: 10px;
    font-weight: 850;
}

.guide-item strong {
    display: block;
    color: #293650;
    font-size: 11px;
}

.guide-item p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 10px;
    line-height: 1.6;
}

.tip-box {
    margin-top: 11px;
    padding: 13px;
    border: 1px solid #dfe6ff;
    border-radius: 9px;
    background: #f5f7ff;
}

.tip-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 5px;
    color: #3549b4;
    font-size: 10px;
    font-weight: 850;
}

.tip-box p {
    margin: 0;
    color: #68749a;
    font-size: 10px;
    line-height: 1.65;
}

.records-card {
    margin-top: 19px;
}

.records-actions {
    display: flex;
    align-items: center;
    gap: 9px;
}

.record-count {
    white-space: nowrap;
    padding: 5px 8px;
    border-radius: 6px;
    color: #4c5dd0;
    background: var(--blue-wash);
    font-size: 9px;
    font-weight: 850;
}

.search-wrap {
    position: relative;
    width: min(240px,36vw);
}

.search-wrap span {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: #8b95aa;
    font-size: 15px;
    pointer-events: none;
}

.search-input {
    min-height: 34px;
    padding: 7px 10px 7px 31px;
    border-color: #e4e8f1;
    background: #fbfcff;
    font-size: 10px;
}

.table-wrap {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

th {
    padding: 12px 15px;
    color: #8590a5;
    background: #fafbfe;
    border-bottom: 1px solid var(--line);
    font-size: 9px;
    font-weight: 850;
    letter-spacing: .7px;
    text-transform: uppercase;
    white-space: nowrap;
}

td {
    padding: 13px 15px;
    color: #4c5870;
    border-bottom: 1px solid #eef1f6;
    font-size: 10px;
    vertical-align: middle;
}

tbody tr:last-child td {
    border-bottom: 0;
}

tbody tr:hover {
    background: #fbfcff;
}

.number-cell {
    width: 46px;
    color: #9aa4b5;
    font-size: 10px;
    font-weight: 850;
}

.student-cell {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 145px;
}

.student-avatar {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    flex: 0 0 31px;
    border-radius: 10px;
    color: #4458ca;
    background: #eef1ff;
    font-size: 11px;
    font-weight: 850;
}

.student-detail strong {
    display: block;
    max-width: 190px;
    overflow-wrap: anywhere;
    color: #293550;
    font-size: 10px;
}

.student-detail small {
    display: block;
    margin-top: 3px;
    color: #8b95a8;
    font-size: 9px;
}

.assignment-title {
    display: inline-block;
    max-width: 200px;
    color: #46536b;
    overflow-wrap: anywhere;
}

.table-link {
    color: #4058de;
    text-decoration: none;
    font-size: 10px;
    font-weight: 800;
    white-space: nowrap;
}

.table-link:hover {
    text-decoration: underline;
}

.status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 7px;
    border-radius: 20px;
    color: var(--green);
    background: var(--green-wash);
    font-size: 9px;
    font-weight: 800;
    white-space: nowrap;
}

.status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #21a464;
}

.date-text {
    display: block;
    margin-top: 4px;
    color: #929caf;
    font-size: 9px;
    white-space: nowrap;
}

.empty {
    padding: 41px 20px;
    color: #8b95aa;
    text-align: center;
}

.empty-icon {
    display: grid;
    place-items: center;
    width: 47px;
    height: 47px;
    margin: 0 auto 11px;
    border-radius: 14px;
    color: #5367e6;
    background: var(--blue-wash);
    font-size: 22px;
}

.empty strong {
    display: block;
    margin-bottom: 4px;
    color: #34415b;
    font-size: 11px;
}

.empty p {
    margin: 0;
    font-size: 10px;
}

.no-results {
    display: none;
    padding: 22px;
    color: var(--muted);
    text-align: center;
    font-size: 11px;
}

footer {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding: 21px 2px 0;
    color: #929caf;
    font-size: 9px;
}

@media (max-width: 1120px) {
    .sidebar { width: 210px; }
    .workspace { margin-left: 210px; }
    .content-grid { grid-template-columns: 1fr; }
    .guide-body {
        display: grid;
        grid-template-columns: repeat(2,minmax(0,1fr));
        gap: 0 18px;
    }
    .guide-intro, .tip-box { grid-column: 1 / -1; }
    .hero-art { right: 23px; transform: translateY(-50%) scale(.82); }
}

@media (max-width: 760px) {
    .sidebar {
        position: static;
        width: auto;
        padding: 14px 4%;
    }
    .brand { padding: 0; }
    .nav-label, .nav-list, .sidebar-spacer,
    .sidebar-note, .sidebar-footer { display: none; }
    .workspace { margin-left: 0; }
    .topbar { height: 56px; padding: 0 4%; }
    .main-content { width: 92%; padding-top: 24px; }
    .hero { min-height: 160px; padding: 23px 22px; }
    .hero-art {
        right: 6px;
        opacity: .45;
        transform: translateY(-50%) scale(.6);
    }
    .hero-copy { max-width: 90%; }
    .stats { gap: 10px; }
    .stat-card { padding: 13px; gap: 10px; }
    .stat-icon { width: 36px; height: 36px; flex-basis: 36px; }
    .stat-value { font-size: 21px; }
    .records-actions { flex-wrap: wrap; }
}

@media (max-width: 540px) {
    .topbar-right .local-indicator { font-size: 0; padding: 8px; }
    .page-heading { align-items: flex-start; flex-direction: column; }
    .date-chip { font-size: 10px; }
    .hero h2 { font-size: 21px; }
    .hero p { font-size: 11px; }
    .hero-art { right: -28px; opacity: .25; }
    .stats { grid-template-columns: 1fr; }
    .stat-card { min-height: 70px; }
    .guide-body { display: block; }
    .card-header, .form-body, .guide-body { padding: 16px; }
    .records-heading {
        align-items: flex-start;
        flex-direction: column;
    }
    .records-actions { width: 100%; justify-content: flex-start; }
    .search-wrap { width: 100%; }
    .record-count { margin-left: auto; }
    footer { flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        scroll-behavior: auto !important;
        transition: none !important;
    }
}
</style>
</head>

<body>
<div class="app-shell">
    <aside class="sidebar" aria-label="Main navigation">
        <a class="brand" href="/" aria-label="Submitly dashboard">
            <span class="brand-mark">S</span>
            <span>
                <span class="brand-name">Submitly</span>
                <span class="brand-caption">Academic workspace</span>
            </span>
        </a>

        <div class="nav-label">Workspace</div>

        <nav class="nav-list">
            <a class="nav-link active" href="#overview">
                <span class="nav-icon">▦</span> Overview
            </a>
            <a class="nav-link" href="#submission-form">
                <span class="nav-icon">＋</span> New submission
            </a>
            <a class="nav-link" href="#submission-records">
                <span class="nav-icon">▤</span> Submission records
            </a>
        </nav>

        <div class="sidebar-spacer"></div>

        <div class="sidebar-note">
            <div class="sidebar-note-icon">✦</div>
            <strong>Keep your work organized</strong>
            <p>Use a working link and double-check your student details before submitting.</p>
        </div>

        <div class="sidebar-footer">CSC418 · DevOps Lab Midterm</div>
    </aside>

    <div class="workspace">
        <header class="topbar">
            <div class="breadcrumb">
                Workspace <span aria-hidden="true"> / </span>
                <strong>Overview</strong>
            </div>

            <div class="topbar-right">
                <span class="local-indicator">
                    <span class="live-dot"></span> Local workspace
                </span>
                <span class="profile-avatar">ST</span>
            </div>
        </header>

        <main class="main-content" id="overview">
            <section class="page-heading">
                <div>
                    <div class="eyebrow">STUDENT DASHBOARD</div>
                    <h1>Assignment submissions</h1>
                    <p class="subtitle">
                        A central place to submit, organize, and revisit your assignment links.
                    </p>
                </div>

                <div class="date-chip">
                    <span aria-hidden="true">◷</span>
                    ${escapeHtml(today)}
                </div>
            </section>

            <section class="hero" aria-label="Welcome">
                <div class="hero-copy">
                    <div class="hero-kicker">Your academic workspace</div>
                    <h2>Good work deserves a clear submission.</h2>
                    <p>
                        Submit your assignment details in a few simple steps.
                        Valid submissions are saved and displayed in your records below.
                    </p>
                </div>
                <div class="hero-art" aria-hidden="true"><span>↗</span></div>
            </section>

            <section class="stats" aria-label="Submission statistics">
                <div class="stat-card">
                    <div class="stat-icon">▤</div>
                    <div>
                        <div class="stat-label">Total submissions</div>
                        <div class="stat-value">${total}</div>
                        <div class="stat-foot">All saved records</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">♙</div>
                    <div>
                        <div class="stat-label">Unique students</div>
                        <div class="stat-value">${uniqueStudents}</div>
                        <div class="stat-foot">By registration number</div>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="stat-icon">◷</div>
                    <div>
                        <div class="stat-label">Last 7 days</div>
                        <div class="stat-value">${recentCount}</div>
                        <div class="stat-foot">Recently recorded</div>
                    </div>
                </div>
            </section>

            <section class="content-grid">
                <article class="card" id="submission-form">
                    <div class="card-header">
                        <div>
                            <h2>Submit an assignment</h2>
                            <p>Fill in each required field to record your work.</p>
                        </div>
                        <span class="step-chip">FORM 01</span>
                    </div>

                    <div class="form-body">
                        ${message ? `
                            <div class="message ${isError ? 'error' : 'success'}"
                                 role="alert">${escapeHtml(message)}</div>
                        ` : ''}

                        <form action="/submit" method="POST">
                            <div class="field">
                                <label for="name">
                                    Student full name <span class="required">*</span>
                                </label>
                                <input id="name" name="name"
                                       autocomplete="name" maxlength="120"
                                       placeholder="e.g. Ali Ahmed" required>
                            </div>

                            <div class="field">
                                <label for="registrationNumber">
                                    Registration number <span class="required">*</span>
                                </label>
                                <input id="registrationNumber"
                                       name="registrationNumber" maxlength="60"
                                       placeholder="e.g. FA24-BSE-017" required>
                            </div>

                            <div class="field">
                                <label for="assignmentTitle">
                                    Assignment title <span class="required">*</span>
                                </label>
                                <input id="assignmentTitle"
                                       name="assignmentTitle" maxlength="200"
                                       placeholder="Enter your assignment name" required>
                            </div>

                            <div class="field">
                                <label for="submissionUrl">
                                    Submission URL <span class="required">*</span>
                                </label>
                                <input id="submissionUrl" name="submissionUrl"
                                       type="url" maxlength="2048"
                                       placeholder="https://github.com/username/project"
                                       required>
                                <span class="field-help">
                                    Provide a working link beginning with https:// or http://
                                </span>
                            </div>

                            <button class="submit-btn" type="submit">
                                Submit assignment <span aria-hidden="true">→</span>
                            </button>
                        </form>

                        <div class="secure-note">
                            <span aria-hidden="true">▣</span>
                            Saved locally to this project's JSON data file.
                        </div>
                    </div>
                </article>

                <aside class="card" aria-label="Submission guidance">
                    <div class="card-header">
                        <div>
                            <h2>Submission checklist</h2>
                            <p>A quick review before you submit.</p>
                        </div>
                    </div>

                    <div class="guide-body">
                        <p class="guide-intro">
                            A complete submission helps keep the records accurate and easy to review.
                        </p>

                        <div class="guide-item">
                            <span class="guide-number">01</span>
                            <div>
                                <strong>Confirm your details</strong>
                                <p>Enter your full name and correct registration number.</p>
                            </div>
                        </div>

                        <div class="guide-item">
                            <span class="guide-number">02</span>
                            <div>
                                <strong>Use a clear title</strong>
                                <p>Choose an assignment title that is easy to recognize later.</p>
                            </div>
                        </div>

                        <div class="guide-item">
                            <span class="guide-number">03</span>
                            <div>
                                <strong>Check the URL</strong>
                                <p>Make sure the link uses HTTP or HTTPS and opens the right work.</p>
                            </div>
                        </div>

                        <div class="tip-box">
                            <div class="tip-title">✦ Helpful tip</div>
                            <p>
                                For a GitHub project, copy the repository URL.
                                For a document or online file, check its sharing permissions before submitting.
                            </p>
                        </div>
                    </div>
                </aside>
            </section>

            <section class="card records-card" id="submission-records">
                <div class="card-header records-heading">
                    <div>
                        <h2>Submission records</h2>
                        <p>Search and review assignments saved in this portal.</p>
                    </div>

                    <div class="records-actions">
                        <label class="search-wrap" for="recordSearch">
                            <span aria-hidden="true">⌕</span>
                            <input class="search-input" id="recordSearch"
                                   type="search" placeholder="Search records..."
                                   autocomplete="off">
                        </label>

                        <span class="record-count">
                            ${total} RECORD${total === 1 ? '' : 'S'}
                        </span>
                    </div>
                </div>

                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Student</th>
                                <th>Assignment</th>
                                <th>Submission link</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody id="recordsBody">
                            ${rows || `
                                <tr>
                                    <td colspan="5">
                                        <div class="empty">
                                            <div class="empty-icon">▤</div>
                                            <strong>No submissions yet</strong>
                                            <p>Completed submissions will appear here.</p>
                                        </div>
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>

                    <div class="no-results" id="noResults">
                        No records match your search.
                    </div>
                </div>
            </section>

            <footer>
                <span>© ${new Date().getFullYear()} Submitly · Student workspace</span>
                <span>CSC418 DevOps Lab Midterm · Local demo application</span>
            </footer>
        </main>
    </div>
</div>

<script>
const searchBox = document.getElementById('recordSearch');
const rows = Array.from(document.querySelectorAll('[data-submission-row]'));
const noResults = document.getElementById('noResults');

if (searchBox) {
    searchBox.addEventListener('input', () => {
        const query = searchBox.value.trim().toLowerCase();
        let visible = 0;

        rows.forEach(row => {
            const match = (row.dataset.search || '').includes(query);
            row.hidden = !match;
            if (match) visible++;
        });

        if (noResults) {
            noResults.style.display =
                rows.length && visible === 0 ? 'block' : 'none';
        }
    });
}
</script>
</body>
</html>`;
}

function sendPage(response, message = '', isError = false, statusCode = 200) {
    response.writeHead(statusCode, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'no-store'
    });

    response.end(renderPage({ message, isError }));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        let size = 0;
        let rejected = false;

        request.on('data', chunk => {
            if (rejected) return;

            size += chunk.length;

            if (size > MAX_BODY_SIZE) {
                rejected = true;
                reject(Object.assign(
                    new Error('Request body is too large.'),
                    { statusCode: 413 }
                ));
                request.resume();
                return;
            }

            body += chunk.toString('utf8');
        });

        request.on('end', () => {
            if (!rejected) resolve(body);
        });

        request.on('error', error => {
            if (!rejected) reject(error);
        });
    });
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(
        request.url,
        `http://${request.headers.host || 'localhost'}`
    );

    if (request.method === 'GET' && requestUrl.pathname === '/') {
        const submitted = requestUrl.searchParams.get('submitted') === '1';

        return sendPage(
            response,
            submitted
                ? 'Assignment submitted successfully. Your record has been saved.'
                : '',
            false,
            200
        );
    }

    if (request.method === 'POST' && requestUrl.pathname === '/submit') {
        try {
            const body = await readBody(request);
            const contentType = request.headers['content-type'] || '';

            const data = contentType.includes('application/json')
                ? JSON.parse(body)
                : Object.fromEntries(new URLSearchParams(body));

            const result = validateSubmission(data);

            if (!result.valid) {
                return sendPage(
                    response,
                    result.errors.join(' '),
                    true,
                    400
                );
            }

            const records = getSubmissions();

            records.push({
                ...result.submission,
                submittedAt: new Date().toISOString()
            });

            saveSubmissions(records);

            response.writeHead(303, {
                Location: '/?submitted=1',
                'Cache-Control': 'no-store'
            });

            return response.end();
        } catch (error) {
            if (response.headersSent || response.destroyed) return;

            const status = error.statusCode || 400;

            return sendPage(
                response,
                status === 413
                    ? 'Request is too large. Please try again.'
                    : 'Unable to process this submission. Check the form details and try again.',
                true,
                status
            );
        }
    }

    response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });

    response.end('404 - Page not found');
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log('==============================================');
        console.log('  Submitly | Assignment Submission Portal');
        console.log(`  Open http://localhost:${PORT} in your browser`);
        console.log('  Press Ctrl+C to stop the server');
        console.log('==============================================');
    });

    server.on('error', error => {
        console.error(`Could not start the portal: ${error.message}`);

        if (error.code === 'EADDRINUSE') {
            console.error(
                `Port ${PORT} is already in use. Stop the existing Node.js server or use PORT=3001.`
            );
        }

        process.exitCode = 1;
    });
}

module.exports = {
    server,
    validateSubmission,
    getSubmissions,
    saveSubmissions,
    renderPage,
    DATA_FILE
};
