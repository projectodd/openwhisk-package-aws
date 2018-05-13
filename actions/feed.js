
const AWS = require('aws-sdk');

function initAws(args) {
  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  const region = args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});
}

function main(args) {
  initAws(args);
  const lifecycleEvent = args.lifecycleEvent;
  if (lifecycleEvent === 'CREATE') {
    console.log("Creating trigger " + args.triggerName);
    return triggerCreate(args);
  }
  if (lifecycleEvent === 'DELETE') {
    console.log("Deleting trigger " + args.triggerName);
    return triggerDelete(args);
  }
}

function triggerCreate(args) {

  if (!args.bucket) return {error: "Bucket name is required"};

  const bucket = args.bucket;
  const trigger = triggerName(args);
  const endpoint = endpointUrl(args.webhookAction, trigger);

  const s3 = new AWS.S3();
  const sns = new AWS.SNS();

  const setTopicAttributes = function(data) {
    const topicArn = data.TopicArn;
    const params = {
      AttributeName: 'Policy', /* required */
      TopicArn: topicArn, /* required */
      AttributeValue: JSON.stringify({
        Version: "2008-10-17",
        Id: "s3-publish-to-sns",
        Statement: [{
          Effect: "Allow",
          Principal: { "AWS" : "*" },
          Action: [ "SNS:Publish" ],
          Resource: topicArn,
          Condition: {
            ArnLike: {
              "aws:SourceArn": "arn:aws:s3:*:*:" + bucket
            }
          }
        }]
      })
    };
    return sns.setTopicAttributes(params).promise()
      .then(_ => topicArn);
  }
  const subscribe = function(topicArn) {
    const params = {
      Protocol: 'https', /* required */
      TopicArn: topicArn, /* required */
      Endpoint: endpoint
    };
    return sns.subscribe(params).promise()
      .then(_ => topicArn);
  }
  const configureBucketNotification = function(topicArn) {
    return s3.getBucketNotificationConfiguration({Bucket: bucket}).promise()
      .then(data => {
        data.TopicConfigurations.push({Events: [ "s3:ObjectCreated:*" ], TopicArn: topicArn});
        const params = {
          Bucket: bucket,
          NotificationConfiguration: data
        };
        return s3.putBucketNotificationConfiguration(params).promise()
      })
      .then(_ => topicArn);
  }

  return new Promise(function(resolve, reject) {
    s3.getBucketLocation({Bucket: bucket}).promise() // ensure bucket exists
      .then(_ => sns.createTopic({Name: trigger}).promise())
      .then(setTopicAttributes)
      .then(subscribe)
      .then(configureBucketNotification)
      .then(topicArn => resolve({bucket, trigger, topicArn, endpoint}))
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
}

function triggerDelete(args) {
  initAws(args);
  const sns = new AWS.SNS();
  const s3 = new AWS.S3();
  const trigger = triggerName(args);

  const reconfigureBucketNotification = function(topic) {
    // Gnarly because we have to find our bucket in the bowels of
    // the topic's policy. We could avoid this if the DELETE
    // action passed the same bucket param we passed to CREATE
    return sns.getTopicAttributes(topic).promise()
      .then(data => {
        const b = JSON.parse(data.Attributes.Policy).Statement[0].Condition.ArnLike['aws:SourceArn'].split(':');
        const bucket = b[b.length - 1];
        return s3.getBucketNotificationConfiguration({Bucket: bucket}).promise()
          .then(data => {
            data.TopicConfigurations = data.TopicConfigurations.filter(x => x.TopicArn != topic.TopicArn);
            const params = {
              Bucket: bucket,
              NotificationConfiguration: data
            };
            return s3.putBucketNotificationConfiguration(params).promise()
              .then(_ => topic);
          });
      });
  }

  return new Promise(function(resolve, reject) {
    sns.listTopics().promise()
      .then(data => data.Topics.find(x => x.TopicArn.match(':'+trigger+'$')))
      .then(reconfigureBucketNotification)
      .then(topic => sns.deleteTopic(topic).promise())
      .then(data => resolve(data))
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
}

function endpointUrl(webhookAction, trigger) {
  var action = process.env['__OW_ACTION_NAME'].split('/');
  action[action.length - 1] = webhookAction;
  action = action.join('/');
  return process.env['__OW_API_HOST'] + '/api/v1/web' + action + '?trigger=' + trigger;
}

function triggerName(args) {
  const x = args.triggerName.split('/');
  return x[x.length - 1];
}

exports.main = main;
