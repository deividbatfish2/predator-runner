'use strict';

const artillery = require('artillery/core'),
    path = require('path'),
    fs = require('fs');

const testFileConnector = require('../connectors/testFileConnector'),
    customJSConnector = require('../connectors/customJSConnector'),
    reporterConnector = require('../connectors/reporterConnector'),
    logger = require('../utils/logger'),
    reportPrinter = require('./reportPrinter'),
    progressCalculator = require('../helpers/progressCalculator'),
    metrics = require('../helpers/runnerMetrics');

let statsToRecord = 0;
let firstIntermediate = true;

module.exports.runTest = async (jobConfig) => {
    let test, localProcessorPath;
    test = await testFileConnector.getTest(jobConfig);
    localProcessorPath = await getProcessorPathIfExists(jobConfig, test);
    await reporterConnector.createReport(jobConfig, test);
    updateTestParameters(jobConfig, test.artillery_test, localProcessorPath);
    logger.info(`Starting test: ${test.name}, testId: ${test.id}`);
    progressCalculator.calculateTotalNumberOfScenarios(jobConfig);

    const ee = await artillery.runner(test.artillery_test, undefined, { isAggregateReport: false });
    return new Promise((resolve, reject) => {
        ee.on('phaseStarted', (info) => {
            logger.info('Starting phase: %s - %j', new Date(), JSON.stringify(info));
            const phaseIndex = info.index ? info.index.toString() : '0';
            reporterConnector.postStats(jobConfig, {
                phase_index: phaseIndex,
                phase_status: 'started_phase',
                data: JSON.stringify(info)
            });
        });
        ee.on('phaseCompleted', () => {
            logger.info('Phase completed - %s', new Date());
        });
        ee.on('stats', async (stats) => {
            statsToRecord++;
            let intermediateReport = stats.report();
            let progress = progressCalculator.calculateProgress(stats._completedScenarios + stats._scenariosAvoided);
            logger.info(`Completed ${progress}%`);
            reportPrinter.print('intermediate', intermediateReport);
            delete intermediateReport.latencies;

            reporterConnector.postStats(jobConfig, {
                phase_status: firstIntermediate ? 'first_intermediate' : 'intermediate',
                data: JSON.stringify(intermediateReport)
            });
            firstIntermediate = false;

            const runnerMetrics = await metrics.getMetrics();
            await metrics.printMetrics(runnerMetrics);

            statsToRecord--;
        });
        ee.on('done', async (report) => {
            let handleFinishedReport = async () => {
                try {
                    await reporterConnector.postStats(jobConfig, {
                        phase_status: 'done',
                        data: JSON.stringify({ message: 'Test Finished' })
                    });
                    resolve();
                } catch (e) {
                    logger.error({ error: e }, 'Failed to send final report to predator');
                    reject(e);
                }
            };
            await waitForLiveStatsToFinish(handleFinishedReport);
        });
        ee.run();
    });
};

let updateTestParameters = (jobConfig, testFile, localProcessorPath) => {
    if (jobConfig.metricsExportConfig && jobConfig.metricsPluginName) {
        injectPlugins(testFile, jobConfig);
    }

    if (localProcessorPath) {
        const processor = require(localProcessorPath);
        testFile.config.processor = processor;
    }
    if (!testFile.config.phases) {
        testFile.config.phases = [{}];
    }
    testFile.config.phases[0].duration = jobConfig.duration;
    testFile.config.phases[0].arrivalRate = jobConfig.arrivalRate;

    if (!testFile.config.http) {
        testFile.config.http = {};
    }
    testFile.config.http.pool = jobConfig.httpPoolSize;

    testFile.config.statsInterval = jobConfig.statsInterval;

    if (!jobConfig.rampTo) {
        delete testFile.config.phases[0].rampTo;
    } else {
        testFile.config.phases[0].rampTo = jobConfig.rampTo;
    }

    if (!jobConfig.maxVusers) {
        delete testFile.config.phases[0].maxVusers;
    } else {
        testFile.config.phases[0].maxVusers = jobConfig.maxVusers;
    }

    logger.info({ updated_test_config: testFile.config }, 'Test successfully updated parameters');
};

function injectPlugins(testFile, jobConfig) {
    const metricsPluginName = jobConfig.metricsPluginName.toLowerCase();
    const metricsAdapter = require(`../adapters/${metricsPluginName}Adapter`);
    let asciiMetricsExportConfig = (Buffer.from(jobConfig.metricsExportConfig, 'base64').toString('ascii'));
    let parsedMetricsConfig = JSON.parse(asciiMetricsExportConfig);
    testFile.config.plugins = metricsAdapter.buildMetricsPlugin(parsedMetricsConfig, jobConfig);
}

async function writeFileToLocalFile(jsCode) {
    const fileName = 'processor_file.js';
    try {
        fs.writeFileSync(fileName, jsCode);
        return path.resolve(__dirname, '..', '..', fileName);
    } catch (err) {
        let error = new Error('Something went wrong writing to local processor file. error: ' + err);
        throw error;
    }
}

async function getProcessorPathIfExists(jobConfig, test) {
    let localProcessorPath;
    if (test['file_id']) {
        logger.warn('DEPRECATED: Using file_id in tests is deprecated and will soon be no longer supported. Please use the Processors API in order to use custom javascript in your tests.\n Link to API documentation: https://zooz.github.io/predator/indexapiref.html#tag/Processors');
        const fileContentBase64 = await customJSConnector.getFile(jobConfig, test['file_id']);
        const fileContent = Buffer.from(fileContentBase64, 'base64').toString('utf8');
        localProcessorPath = writeFileToLocalFile(fileContent);
    } else if (test['processor_id']) {
        const processor = await customJSConnector.getProcessor(jobConfig, test['processor_id']);
        localProcessorPath = writeFileToLocalFile(processor.javascript);
    }
    return localProcessorPath;
}

let waitForLiveStatsToFinish = async (callback) => {
    if (statsToRecord) {
        setTimeout(() => {
            waitForLiveStatsToFinish(callback);
        }, 1500);
    } else {
        await callback();
    }
};