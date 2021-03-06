const nock = require('nock'),
    uuid = require('uuid/v4'),
    path = require('path'),
    should = require('should'),
    fs = require('fs'),
    runner = require('../../../app/models/runner');

const PREDATOR_URL = process.env.PREDATOR_URL || 'test';
const duration = 10;
const arrivalRate = 10;
const runId = process.env.RUN_ID;

describe('Successfully run a basic test', function () {
    const testId = uuid();
    let getTest, postReport, postStats;
    before(async function () {
        const customTestPath = path.resolve(__dirname, '../../test-scripts/simple_test.json');
        const customTestBody = require(customTestPath);

        customTestBody.artillery_test = customTestBody.artillery_test;

        getTest = nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .times(1)
            .reply(200, customTestBody);

        postReport = nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports`)
            .times(1)
            .reply(201, {message: 'OK'});

        postStats = nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports/${runId}/stats`)
            .times(4)
            .reply(201, {message: 'OK'});
    });

    it('Run test', async function () {
        this.timeout(100000);
        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        await runner.runTest(jobConfig);
    });

    it('Test should get test and create report in predator', async function () {
        should.equal(getTest.isDone(), true);
        should.equal(postReport.isDone(), true);
    });
});
describe('Successfully run a custom js test', function () {
    const testId = uuid();
    const fileId = uuid();
    const write = process.stdout.write;
    let output;
    before(async function () {
        process.stdout.write = function (str) {
            output += str;
        };
    });
    after(function() {
        process.stdout.write = write;
    });
    const customTestPath = path.resolve(__dirname, '../../test-scripts/custom_js_processor_test_with_log.json');
    const customJsPath = path.resolve(__dirname, '../../test-scripts/custom_js_code_test');
    const customJsCodeEncoding = fs.readFileSync(customJsPath, 'base64');
    const customTestBody = require(customTestPath);
    customTestBody.file_id = fileId;
    nock(PREDATOR_URL)
        .get(`/tests/${testId}`)
        .times(1)
        .reply(200, customTestBody);
    nock(PREDATOR_URL)
        .post(`/tests/${testId}/reports`)
        .times(1)
        .reply(201, {message: 'OK'});

    nock(PREDATOR_URL)
        .post(`/tests/${testId}/reports/${runId}/stats`)
        .times(4)
        .reply(201, {message: 'OK'});
    nock(PREDATOR_URL)
        .get(`/tests/file/${fileId}`)
        .reply(200, customJsCodeEncoding);

    it('Run test', async function () {
        this.timeout(100000);
        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration: 1,
            arrivalRate: 1,
            runId
        };

        await runner.runTest(jobConfig);
    });

    it('Test should log the right value using js func', async function () {
        should(output.includes('Sent a request to /users with name_js_script')).eql(true);
    });
});

describe('Fail to run a custom test - report not created', function () {
    const testId = uuid();

    before(async function () {
        nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .reply(200, {});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports`)
            .times(20)
            .reply(400, {error: 'ERROR'});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports/${runId}/stats`)
            .times(20)
            .reply(201, {message: 'OK'});
    });

    it('Run test', async function () {
        this.timeout(100000);
        const duration = 10;
        const arrivalRate = 10;

        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        try {
            await runner.runTest(jobConfig);
            should.fail('Should throw error');
        } catch (e) {
            should.exist(e);
            should.equal(e.statusCode, 400, 'Error returned should be with status code 400');
        }
    });
});

describe('Fail to run a custom test - fail to send final report stats to reporter', function () {
    const testId = uuid();

    before(async function () {
        const customTestPath = path.resolve(__dirname, '../../test-scripts/simple_test.json');
        const customTestBody = require(customTestPath);

        customTestBody.artillery_test = customTestBody.artillery_test;

        nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .reply(200, customTestBody);

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports`)
            .times(20)
            .reply(201, {message: 'OK'});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports/${runId}/stats`)
            .times(20)
            .reply(400, {error: 'ERROR'});
    });

    it('Run test', async function () {
        this.timeout(100000);
        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        try {
            await runner.runTest(jobConfig);
            should.fail('Should throw error');
        } catch (e) {
            should.exist(e);
            should.equal(e.statusCode, 400, 'Error returned should be with status code 400');
        }
    });
});

describe('Fail to run a custom test - test not found', function () {
    const testId = uuid();

    before(async function () {
        nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .reply(404, {});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports`)
            .times(20)
            .reply(201, {message: 'OK'});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports/${runId}/stats`)
            .times(20)
            .reply(201, {message: 'OK'});
    });

    it('Run test', async function () {
        this.timeout(100000);
        const duration = 10;
        const arrivalRate = 10;

        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        try {
            await runner.runTest(jobConfig);
            should.fail('Should throw error');
        } catch (e) {
            should.exist(e);
            should.equal(e.statusCode, 404, 'Error returned should be with status code 404');
        }
    });
});

describe('Fail to run a custom test with processor custom javascript - processor not found', function () {
    const testId = uuid();
    const processorId = uuid();

    before(async function () {
        nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .reply(200, {
                processor_id: processorId
            });

        nock(PREDATOR_URL)
            .get(`/processors/${processorId}`)
            .reply(404, {});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports`)
            .times(20)
            .reply(201, {message: 'OK'});

        nock(PREDATOR_URL)
            .post(`/tests/${testId}/reports/${runId}/stats`)
            .times(20)
            .reply(201, {message: 'OK'});
    });

    it('Run test', async function () {
        this.timeout(100000);
        const duration = 10;
        const arrivalRate = 10;

        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        try {
            await runner.runTest(jobConfig);
            should.fail('Should throw error');
        } catch (e) {
            should.exist(e);
            should.equal(e.statusCode, 404, 'Error returned should be with status code 404');
        }
    });
});

describe('Fail to get file, file not found', function () {
    const fileId = uuid();
    const testId = uuid();
    before(async function () {
        const customTestPath = path.resolve(__dirname, '../../test-scripts/simple_test.json');
        const customTestBody = require(customTestPath);
        const testBody = Object.assign({}, customTestBody);
        testBody.file_id = fileId;
        nock(PREDATOR_URL)
            .get(`/tests/${testId}`)
            .reply(200, testBody);
        nock(PREDATOR_URL)
            .get(`/tests/file/${fileId}`)
            .reply(404, {});
    });

    it('Run test', async function () {
        this.timeout(100000);

        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            runId
        };

        try {
            await runner.runTest(jobConfig);
            should.fail('Should throw error');
        } catch (e) {
            should.exist(e);
            should.equal(e.statusCode, 404, 'Error returned should be with status code 404');
        }
    });
});
