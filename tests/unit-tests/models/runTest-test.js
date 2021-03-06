let should = require('should');
let sinon = require('sinon');
let uuid = require('uuid/v4');
var EventEmitter = require('events').EventEmitter;
let artillery = require('artillery/core');
let consts = require('../../utils/consts');
let logger = require('../../../app/utils/logger');
let reporterConnector = require('../../../app/connectors/reporterConnector');
let testFileConnector = require('../../../app/connectors/testFileConnector');
let customJSConnector = require('../../../app/connectors/customJSConnector');
let runner = require('../../../app/models/runner');
let metrics = require('../../../app/helpers/runnerMetrics');
let prometheusAdapter = require('../../../app/adapters/prometheusAdapter');
let influxdbAdapter = require('../../../app/adapters/influxAdapter');

let ee;
let stats = {
    _latencies: 'mickey_stats',
    _requestTimestamps: '123',
    _scenarioLatencies: 'mickey',
    _completedRequests: 1,
    report: () => {
        return {
            'timestamp': '2018-05-15T14:20:02.109Z',
            'scenariosCreated': 96,
            'scenariosCompleted': 92,
            'requestsCompleted': 185,
            'latency': {
                'min': 167.6,
                'max': 667.5,
                'median': 193.8,
                'p95': 322.4,
                'p99': 609.6
            },
            'rps': {
                'count': 189,
                'mean': 19.15
            },
            'scenarioDuration': {
                'min': 367.7,
                'max': 1115.1,
                'median': 385.1,
                'p95': 780.8,
                'p99': 1060.9
            },
            'scenarioCounts': {
                'Scenario': 96
            },
            'errors': {},
            'codes': {
                '201': 185
            },
            'matches': 0,
            'customStats': {},
            'concurrency': 4,
            'pendingRequests': 4
        };
    }
};
let report = {
    'timestamp': '2018-05-15T14:20:02.109Z',
    'scenariosCreated': 96,
    'scenariosCompleted': 92,
    'requestsCompleted': 185,
    'latency': {
        'min': 167.6,
        'max': 667.5,
        'median': 193.8,
        'p95': 322.4,
        'p99': 609.6
    },
    'rps': {
        'count': 189,
        'mean': 19.15
    },
    'scenarioDuration': {
        'min': 367.7,
        'max': 1115.1,
        'median': 385.1,
        'p95': 780.8,
        'p99': 1060.9
    },
    'scenarioCounts': {
        'Scenario': 96
    },
    'errors': {},
    'codes': {
        '201': 185
    },
    'matches': 0,
    'customStats': {},
    'concurrency': 4,
    'pendingRequests': 4
};
let info = {info: 'mickey'};
describe('Run test', () => {
    let sandbox, artilleryStub, customJSProcessorStub,
        testFileConnectorStub, loggerInfoStub, reporterConnectorPostStatsStub, reporterConnectorCreateReportStub, eeOnStub, getMetricsSpy, printMetricsSpy, prometheusAdapterStub, influxdbAdapterStub;

    let jobConfig = {
        jobId: 'some_job_id',
        testId: 'mickeys-test',
        httpPoolSize: 100,
        statsInterval: 30
    };

    before(() => {
        sandbox = sinon.createSandbox();
        artilleryStub = sandbox.stub(artillery, 'runner');
        loggerInfoStub = sandbox.stub(logger, 'info');
        reporterConnectorPostStatsStub = sandbox.stub(reporterConnector, 'postStats');
        reporterConnectorCreateReportStub = sandbox.stub(reporterConnector, 'createReport');
        testFileConnectorStub = sandbox.stub(testFileConnector, 'getTest');
        customJSProcessorStub = sandbox.stub(customJSConnector, 'getProcessor');
        getMetricsSpy = sandbox.spy(metrics, 'getMetrics');
        printMetricsSpy = sandbox.spy(metrics, 'printMetrics');
        prometheusAdapterStub = sandbox.stub(prometheusAdapter, 'buildMetricsPlugin');
        influxdbAdapterStub = sandbox.stub(influxdbAdapter, 'buildMetricsPlugin');
    });
    beforeEach(() => {
        sandbox.resetHistory();
        ee = new EventEmitter();
        ee.run = () => {
            ee.emit('phaseStarted');
            ee.emit('phaseCompleted');
            ee.emit('stats');
            ee.emit('done');
        };
        eeOnStub = sandbox.stub(ee, 'on').withArgs('done').yields(report)
            .withArgs('stats').yields(stats)
            .withArgs('phaseStarted').yields(info)
            .withArgs('phaseCompleted').yields();
    });
    after(() => {
        sandbox.restore();
    });

    [
        {
            expectedResult: consts.EXPECTED_ARTILLERY_CUSTOM_TEST,
            test: consts.VALID_CUSTOM_TEST,
            metricsPluginName: 'none'
        },
        {
            expectedResult: consts.EXPECTED_ARTILLERY_CUSTOM_TEST,
            test: consts.VALID_CUSTOM_TEST,
            metricsPluginName: 'prometheus',
            metricsExportConfig: Buffer.from(JSON.stringify(consts.PROMETHEUS_CONFIGURATION)).toString('base64')
        },
        {
            expectedResult: consts.EXPECTED_ARTILLERY_CUSTOM_TEST,
            test: consts.VALID_CUSTOM_TEST,
            metricsPluginName: 'influx',
            metricsExportConfig: Buffer.from(JSON.stringify(consts.INFLUX_CONFIGURATION)).toString('base64')
        }
    ]
    .forEach((testConfig ) => {
        it(`successfully run test with metrics plugin: ${testConfig.metricsPluginName}`, async () => {
            if (testConfig.metricsPluginName === 'influx') {
                influxdbAdapterStub.returns(consts.INFLUX_CONFIGURATION);
                testConfig.expectedResult.config.plugins = consts.INFLUX_CONFIGURATION;
            } else if (testConfig.metricsPluginName === 'prometheus') {
                prometheusAdapterStub.returns(consts.PROMETHEUS_CONFIGURATION);
                testConfig.expectedResult.config.plugins = consts.PROMETHEUS_CONFIGURATION;
            } else {
                delete testConfig.expectedResult.config.plugins;
            }

            let tempJobConfig = Object.assign({}, jobConfig);
            tempJobConfig.arrivalRate = 10;
            tempJobConfig.duration = 5;
            tempJobConfig.notes = 'Best Test Ever';
            tempJobConfig.metricsExportConfig = testConfig.metricsExportConfig;
            tempJobConfig.metricsPluginName = testConfig.metricsPluginName;

            testFileConnectorStub.resolves(testConfig.test);
            artilleryStub.resolves(ee);
            reporterConnectorCreateReportStub.resolves();
            reporterConnectorPostStatsStub.resolves();
            let exception;
            try {
                await runner.runTest(tempJobConfig);
            } catch (e) {
                exception = e;
            }
            should.not.exist(exception);
            JSON.stringify(artilleryStub.args[0][0]).should.eql(JSON.stringify(testConfig.expectedResult));
            testFileConnectorStub.calledOnce.should.eql(true);

            loggerInfoStub.called.should.eql(true);
            let loggerIndex = 1;
            loggerInfoStub.args[loggerIndex][0].should.eql('Starting test: test_name, testId: test_id');
            loggerInfoStub.args[++loggerIndex][0].should.eql('Starting phase: %s - %j');
            loggerInfoStub.args[loggerIndex][2].should.eql(JSON.stringify(info));
            loggerInfoStub.args[++loggerIndex][0].should.eql('Phase completed - %s');
            loggerInfoStub.args[++loggerIndex][0].indexOf('Completed').should.be.greaterThan(-1);
            getMetricsSpy.called.should.eql(true);
            printMetricsSpy.called.should.eql(true);
        });
    });


    it('successfully run test with custom js (processor)', async () => {
        const processorId = uuid();

        let tempJobConfig = Object.assign({}, jobConfig);
        tempJobConfig.arrivalRate = 10;
        tempJobConfig.duration = 5;
        tempJobConfig.rampTo = 20;
        tempJobConfig.maxVusers = 20;
        tempJobConfig.notes = 'Test using processor_id for custom-js';

        let testWithProcessorId = Object.assign({}, consts.VALID_CUSTOM_TEST);
        testWithProcessorId.processor_id = processorId;

        testFileConnectorStub.resolves(testWithProcessorId);
        artilleryStub.resolves(ee);
        reporterConnectorCreateReportStub.resolves();
        reporterConnectorPostStatsStub.resolves();
        customJSProcessorStub.resolves({
            name: 'add_processor',
            javascript: `let addFunction = (a, b) => {
                            return a + b;
                        }`
        });

        let exception;
        try {
            await runner.runTest(tempJobConfig);
        } catch (e) {
            exception = e;
        }
        should.not.exist(exception);
    });

    it('fail to run test with processor ->  GET processor error', async () => {
        let expectedError = new Error('Failed to retrieve processor');
        const processorId = uuid();
        let testWithProcessorId = Object.assign({}, consts.VALID_CUSTOM_TEST);
        testWithProcessorId.processor_id = processorId;

        testFileConnectorStub.resolves(testWithProcessorId);
        artilleryStub.resolves(ee);
        reporterConnectorCreateReportStub.resolves();
        reporterConnectorPostStatsStub.resolves();
        customJSProcessorStub.rejects(expectedError);

        let exception;
        try {
            await runner.runTest(jobConfig);
        } catch (e) {
            exception = e;
        }
        should.exist(exception);
        exception.should.be.eql(expectedError);
    });

    it('fail to run test -> test file error', async () => {
        let expectedError = new Error('Failed to retrieve test file');
        testFileConnectorStub.rejects(expectedError);
        artilleryStub.resolves(ee);
        reporterConnectorCreateReportStub.resolves();
        reporterConnectorPostStatsStub.resolves();
        let exception;
        try {
            await runner.runTest(jobConfig);
        } catch (e) {
            exception = e;
        }
        should.exist(exception);
        exception.should.be.eql(expectedError);

        testFileConnectorStub.calledOnce.should.eql(true);
        loggerInfoStub.called.should.eql(false);
    });

    it('fail to send end report to reporter -> test throws exception', async () => {
        let tempJobConfig = Object.assign({}, jobConfig);
        tempJobConfig.arrivalRate = 10;
        tempJobConfig.duration = 5;
        tempJobConfig.notes = 'Best Test Ever';

        const expectedError = new Error('Failed to send final report to reporter');

        testFileConnectorStub.resolves(consts.VALID_CUSTOM_TEST);
        artilleryStub.resolves(ee);
        reporterConnectorCreateReportStub.resolves();
        reporterConnectorPostStatsStub.rejects(expectedError);
        let exception;
        try {
            await runner.runTest(tempJobConfig);
        } catch (e) {
            exception = e;
        }

        should.exist(exception);
        should(exception).eql(expectedError);
    });
});
