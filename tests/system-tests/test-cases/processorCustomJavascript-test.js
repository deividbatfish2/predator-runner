const path = require('path'),
    should = require('should'),
    uuid = require('uuid/v4'),
    fs = require('fs'),
    predatorApiHelper = require('../../utils/predatorApiHelper'),
    defaults = require('../defaults'),
    simpleServerClient = require('../../utils/simpleServerClient'),
    runner = require('../../../app/models/runner');

let createTestResponse, testId, createJobResponse, jobId,
    customTestBody, createProcessorResponse, duration, arrivalRate;

describe('Processor custom javascript', function () {
    const runId = `system-tester-${Date.now()}-${Math.random() * 14}`;

    before(function (done) {
        this.timeout(10000);

        setTimeout(async function () {
            const customTestPath = path.resolve(__dirname, '../../test-scripts/custom_js_processor_test.json');
            customTestBody = require(customTestPath);
            const customJsPath = path.resolve(__dirname, '../../test-scripts/custom_js_code_test');
            const customJsCodeEncoding = fs.readFileSync(customJsPath, 'utf-8');
            const processor = {
                name: 'create-name',
                description: 'system test processor that creates random names',
                javascript: customJsCodeEncoding
            };

            createProcessorResponse = await predatorApiHelper.createProcessor(processor);

            customTestBody.processor_id = createProcessorResponse.id;

            createTestResponse = await predatorApiHelper.createTest(customTestBody);
            testId = createTestResponse.id;

            createJobResponse = await predatorApiHelper.createJob(testId);
            jobId = createJobResponse.id;
            done();
        }, 500);
    });

    after(async function () {
        await predatorApiHelper.deleteJob(jobId);
        await simpleServerClient.deleteDB();
    });

    it('Runner should successfully run test', async function () {
        this.timeout(100000);
        duration = 4;
        arrivalRate = 4;
        const httpPoolSize = 1;
        const containerId = uuid();

        const jobConfig = {
            predatorUrl: process.env.PREDATOR_URL,
            testId,
            duration,
            arrivalRate,
            httpPoolSize,
            runId,
            jobId,
            containerId
        };
        Object.assign(jobConfig, defaults.jobConfig);

        await runner.runTest(jobConfig);
    });

    it('Test should invoke custom js function', async function () {
        const pets = await simpleServerClient.getPets();
        const petNames = pets.map((pet) => pet.name);
        should(petNames.length).eql(duration * arrivalRate);
        const uniquePetNames = Array.from(new Set(petNames));
        should(uniquePetNames.length).eql(duration * arrivalRate);
        uniquePetNames.forEach((name) => {
            should(name.includes('name_js_script_')).eql(true);
        });
    });
});