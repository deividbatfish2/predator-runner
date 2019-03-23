const should = require('should');
const prometheusAdapter = require('../../../app/adapters/prometheusAdapter');

const jobConfig = {
    runId: '123',
    testName: 'MickeysTest',
    cluster: 'Dev'
};

const metricsConfig = {
    prometheus_push_gateway_url: 'url',
};

const expectedPluginConfiguartion = {
    prometheus:
        {
            pushGatewayUrl: 'url',
            labels: {
                testName: 'MickeysTest',
                testRunId: '123',
                cluster: 'Dev'
            }
        }
};

describe('Influxdb adapter test', () => {
    it('Should retrieve prometheus plugin configuration without bucket_sizes', () => {
        const pluginConfiguration = prometheusAdapter.buildMetricsPlugin(metricsConfig, jobConfig);
        should(pluginConfiguration).eql(expectedPluginConfiguartion);
    });

    it('Should retrieve prometheus plugin configuration with bucket_sizes', () => {
        metricsConfig.prometheus_bucket_sizes = [0.5, 1, 5, 10, 100];
        const pluginConfiguration = prometheusAdapter.buildMetricsPlugin(metricsConfig, jobConfig);
        expectedPluginConfiguartion.prometheus.bucketSizes = [0.5, 1, 5, 10, 100];
        should(pluginConfiguration).eql(expectedPluginConfiguartion);
    });
});