# AWSpenWhisk

This package facilitates the triggering of [Apache OpenWhisk] actions
in response to events published to [AWS] [SNS] topics. Specific
support for [S3] change notifications is provided, but the package can
be used to integrate a public OpenWhisk cloud with any service capable
of publishing events to an [SNS] topic.

| Entity | Type | Parameters | Description |
| --- | --- | --- | --- |
| `aws` | package | region, accessKeyId, secretAccessKey | Amazon Web Services integration |
| `aws/events` | feed | topicArn, bucket, events | Automatic creation and configuration for AWS event delivery |
| `aws/from-sns` | web action | trigger | A web action that fires a trigger upon receipt of an SNS notification |

**IMPORTANT!** AWS needs to be able to visit the `aws/from-sns` web
action, so your OpenWhisk cluster needs to be publicly accessible.

## Installation

Assumptions:

* You've cloned this repo
* [wsk] is in your path and configured with the proper `--apihost` and
  `--auth` properties.
* [npm] and `zip` are installed
* Your OpenWhisk cluster is on a public cloud

With that, simply run:

    ./install.sh 

## Configuration

You'll need to bind the package to your region and AWS credentials:

    wsk package bind aws myaws \
        -p region us-east-1 \
        -p accessKeyId YOUR_ACCESS_KEY_ID \
        -p secretAccessKey YOUR_SECRET_ACCESS_KEY
    wsk package get myaws --summary

## Usage

The `aws/events` feed is the primary interface to the package.

### SNS Topics

By default, a trigger created from the `aws/events` feed will attempt
to create an SNS topic with the same name as the trigger, subscribe to
it using the URL for the `from-sns` webhook as an endpoint, and return
its `TopicArn`. When the trigger is later deleted, the corresponding
topic will be deleted, too.

    wsk trigger mytrigger --feed myaws/events

If successful, you should see the `TopicArn` in the output. You can
use that to indirectly fire your trigger:

    aws sns publish --message "Hello World" --topic-arn "arn:aws:sns:us-east-1:999999999999:mytrigger"

Alternatively, you can associate your trigger with an existing SNS
topic by passing its ARN as a parameter:

    wsk trigger mytrigger --feed myaws/events -p topicArn "arn:aws:sns:us-east-1:999999999999:an-existing-topic"

When you pass the `topicArn`, the topic will remain after your trigger
is deleted. Only topics created by the feed will be subsequently
deleted with the trigger.

### S3 Notifications

The `aws/events` feed provides an optional `bucket` parameter. When
set with the name of a valid bucket in your region, the feed will
configure both the bucket and the topic to fire your trigger with S3
change events.

And the `events` parameter allows you specify a comma-delimited list
of the exact [S3 event types] you desire. By default, you'll get
`s3:ObjectCreated:*`

### Example

Let's run through an example to demonstrate how to receive AWS S3
change events in your OpenWhisk cluster.

If you don't already have one, create an S3 bucket in the same region
to which you bound the package above, e.g.
    
    aws s3 mb s3://mybucket --region us-east-1

Now create a trigger referencing that bucket:

    wsk trigger create mytrigger --feed myaws/events -p bucket mybucket

Finally, create a rule that will invoke the system `echo` action to
capture the S3 event in an activation record. You'll probably think of
something way more creative for your action.

    wsk rule create myrule mytrigger /whisk.system/utils/echo
    
That's it! Now any time you write an object to your bucket, you should
see the `from-sns` webhook fire `mytrigger`, thereby invoking the
`echo` action.

Try polling for activations in a separate terminal...

    wsk activation poll
    
And then put something in your bucket!

    >test-file
    aws s3 cp test-file s3://mybucket

Hopefully, you'll see some activations spit out. That last one should
contain your S3 notification:

    wsk activation list -l 1 -f

When you delete your trigger, the associated AWS resources (SNS topic,
subscription and S3 event configuration) should be deleted as well:

    wsk trigger delete mytrigger

Feedback, improvements, and enhancement ideas are always welcome!


[wsk]: https://github.com/apache/incubator-openwhisk-cli/releases/
[npm]: https://www.npmjs.com/
[S3 event types]: https://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html#supported-notification-event-types 
[SNS]: https://aws.amazon.com/sns/
[S3]: https://aws.amazon.com/s3/
[Apache OpenWhisk]: http://openwhisk.incubator.apache.org/
[AWS]: https://aws.amazon.com/
