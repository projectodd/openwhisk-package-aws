
const AWS = require('aws-sdk');
const openwhisk = require('openwhisk');
const util = require('util');

function main(args) {
  const lifecycleEvent = args.lifecycleEvent;

  if (lifecycleEvent === 'CREATE') {
    return triggerCreate(args);
  }
  if (lifecycleEvent === 'DELETE') {
    return triggerDelete(args);
  } else {
    console.log('Unsupported lifecycle event:', lifecycleEvent);
  }
}

function triggerCreate(args) {
  const {s3, sns} = initAws(args);
  const wsk = openwhisk();
  return new Promise(function(resolve, reject) {
    wsk.triggers.get({name: args.triggerName}).then(trigger => {
      console.log("Create trigger ", util.inspect(trigger, {depth: null}))

      const createTopic = function() {
        const p = args.topicArn ?
              Promise.resolve({TopicArn: args.topicArn}) :
              sns.createTopic({Name: trigger.name}).promise();
        return p.then(data => {
          trigger.aws = data;       // convenient reference, yay mutability?!
          trigger.annotations.push({key: 'aws', value: data});
          return wsk.triggers.update({name: trigger.name, trigger: trigger});
        });
      }
      const subscribe = function() {
        const params = {
          Protocol: 'https', /* required */
          TopicArn: trigger.aws.TopicArn, /* required */
          Endpoint: endpointUrl(args.webhookAction, trigger.name)
        };
        return sns.subscribe(params).promise();
      }
      const configureTopic = function() {
        return sns.getTopicAttributes({TopicArn: trigger.aws.TopicArn}).promise()
          .then(data => {
            const policy = JSON.parse(data.Attributes.Policy);
            policy.Statement.push({
              Sid: trigger.name,
              Effect: "Allow",
              Principal: { "AWS" : "*" },
              Action: [ "SNS:Publish" ],
              Resource: trigger.aws.TopicArn,
              Condition: {
                ArnLike: {
                  "aws:SourceArn": "arn:aws:s3:*:*:" + args.bucket
                }
              }
            });
            const params = {
              TopicArn: trigger.aws.TopicArn,
              AttributeName: 'Policy',
              AttributeValue: JSON.stringify(policy)
            };
            return sns.setTopicAttributes(params).promise();
          });
      }
      const validateBucket = function() {
        return s3.getBucketLocation({Bucket: args.bucket}).promise()
          .then(() => {
            trigger.aws.Bucket = args.bucket;
            return wsk.triggers.update({name: trigger.name, trigger: trigger})
          });
      }
      const configureBucket = function() {
        return s3.getBucketNotificationConfiguration({Bucket: args.bucket}).promise()
          .then(data => {
            var config = {Id: trigger.name, TopicArn: trigger.aws.TopicArn};
            config.Events = args.events.split(/\s*[,;|]\s*/);
            data.TopicConfigurations.push(config);
            const params = {Bucket: args.bucket, NotificationConfiguration: data};
            return s3.putBucketNotificationConfiguration(params).promise();
          });
      }

      var subscription = createTopic().then(subscribe);
      if (args.bucket) {
        subscription = subscription
          .then(validateBucket)
          .then(configureTopic)
          .then(configureBucket);
      }
      return subscription.then(() => resolve(trigger.aws));
    }).catch(err => {
      console.log(err);
      reject(err);
    });
  });
}

function triggerDelete(args) {
  const wsk = openwhisk();
  return new Promise(function(resolve, reject) {
    wsk.triggers.get({name: args.triggerName}).then(trigger => {
      console.log("Delete trigger ", util.inspect(trigger, {depth: null}));

      const aws = trigger.annotations.find(x => x.key == 'aws').value;
      const {Bucket, TopicArn, ResponseMetadata} = aws;
      args.topicArn = TopicArn
      const {sns, s3} = initAws(args);

      const reconfigureBucket = function() {
        return s3.getBucketNotificationConfiguration({Bucket}).promise()
          .then(data => {
            data.TopicConfigurations = data.TopicConfigurations.filter(x => x.TopicArn != TopicArn);
            const params = {Bucket, NotificationConfiguration: data };
            return s3.putBucketNotificationConfiguration(params).promise();
          });
      }
      const reconfigureTopic = function() {
        return sns.getTopicAttributes({TopicArn}).promise()
          .then(data => {
            const policy = JSON.parse(data.Attributes.Policy);
            policy.Statement = policy.Statement.filter(x => x.Sid != trigger.name);
            const params = {TopicArn, AttributeName: 'Policy', AttributeValue: JSON.stringify(policy)};
            return sns.setTopicAttributes(params).promise();
          });
      }
      const unsubscribe = function() {
        // This may fail due to confirmation race condition
        return sns.listSubscriptionsByTopic({TopicArn}).promise()
          .then(data => {
            const subs = data.Subscriptions.filter(x => x.Endpoint.endsWith('trigger=' + trigger.name));
            return Promise.all(subs.map(({SubscriptionArn}) => sns.unsubscribe({SubscriptionArn}).promise()));
          });
      }

      var p = Promise.resolve();
      if (Bucket) {
        p = p.then(reconfigureBucket);
      }
      if (TopicArn) {
        if (ResponseMetadata) // we created it, so we delete it
          p = p.then(() => sns.deleteTopic({TopicArn}).promise());
        else
          p = p.then(reconfigureTopic).then(unsubscribe);
      }
      return p.then(() => resolve(aws));
    }).catch(err => {
      console.log(err);
      reject(err);
    });
  });
}

function initAws(args) {
  const accessKeyId = args.accessKeyId;
  const secretAccessKey = args.secretAccessKey;
  // We must connect to the region in which the topic was created
  const region = args.topicArn ? args.topicArn.split(':')[3] : args.region;
  AWS.config.update({region, credentials: {accessKeyId, secretAccessKey}});
  return {sns: new AWS.SNS(), s3: new AWS.S3()};
}

function endpointUrl(webhookAction, triggerName) {
  var action = process.env['__OW_ACTION_NAME'].split('/');
  action[action.length - 1] = webhookAction;
  action = action.join('/');
  return process.env['__OW_API_HOST'] + '/api/v1/web' + action + '?trigger=' + triggerName;
}

exports.main = main;
