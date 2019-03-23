module.exports.buildMetricsPlugin = (metricsConfig, jobConfig) => {
    let prometheusPlugin = {
        'prometheus': {
            'pushGatewayUrl': metricsConfig.prometheus_push_gateway_url,
            'labels': {
                'testName': jobConfig.testName,
                'testRunId': jobConfig.runId,
                'cluster': jobConfig.cluster
            }
        }
    };

    if (metricsConfig.prometheus_bucket_sizes) {
        prometheusPlugin.prometheus.bucketSizes = metricsConfig.prometheus_bucket_sizes;
    }

    return prometheusPlugin;
};