const requestSender = require('../helpers/requestSender');

let createReport = async (jobConfig, test) => {
    const requestBody = {
        report_id: jobConfig.runId,
        revision_id: jobConfig.revisionId,
        job_id: jobConfig.jobId,
        test_type: test.type,
        start_time: Date.now().toString(),
        notes: jobConfig.notes,
        webhooks: jobConfig.webhooks,
        emails: jobConfig.emails,
        test_name: jobConfig.testName,
        test_description: jobConfig.description,
        runner_id: jobConfig.containerId
    };

    let options = {
        url: jobConfig.predatorUrl + `/tests/${jobConfig.testId}/reports`,
        method: 'POST',
        headers: {
            'x-runner-id': `runner_${jobConfig.runId}`
        },
        body: requestBody
    };

    const report = await requestSender.sendRequest(options);
    return report;
};

let postStats = async (jobConfig, stats) => {
    let defaultBody = {
        runner_id: jobConfig.containerId,
        stats_time: Date.now().toString()
    };

    const requestBody = Object.assign(defaultBody, stats);

    let options = {
        url: jobConfig.predatorUrl + `/tests/${jobConfig.testId}/reports/${jobConfig.runId}/stats`,
        method: 'POST',
        headers: {
            'x-runner-id': `runner_${jobConfig.runId}`
        },
        body: requestBody
    };

    await requestSender.sendRequest(options);
};

module.exports = {
    postStats,
    createReport
};