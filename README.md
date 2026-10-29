
# CSC418 DevOps Lab Midterm

## Assignment Submission Portal

A professional assignment submission portal built with Node.js.

## Features

- Responsive student dashboard
- Assignment submission form
- Required-field and URL validation
- Save and display submissions
- Automated tests
- GitHub Actions continuous integration
- Local JSON test report receiver

## Requirements

- Node.js
- Git

## Run the application

```powershell
node app.js
```

Open http://localhost:3000 in your browser.

## Run automated tests

```powershell
npm test
```

## Start the local report receiver

```powershell
node report-receiver.js
```

The receiver must be created and configured before this command can work.

## Project structure

- `app.js` — Main application
- `package.json` — Project configuration
- `README.md` — Project instructions
- `test/app.test.js` — Automated tests
- `.github/workflows/ci.yml` — CI pipeline
- `report-receiver.js` — Local report receiver

## Course

CSC418 — DevOps Lab Midterm Examination
