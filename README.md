# AWSpenWhisk

Integration of AWS services with public clouds running
[Apache OpenWhisk].

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

## S3 Notifications

This package's `events` feed enables you to trigger OpenWhisk actions
with [S3] change notification events. When you create a trigger with
the feed, an [SNS] topic is created on AWS to which an `https`
endpoint is subscribed. The URL for the endpoint is that of this
package's `from-sns` web action.

*IMPORTANT* AWS needs to be able to visit the web action, so your
OpenWhisk cluster needs to be publicly accessible.

The feed provides two parameters: 
* `bucket` - The name of the S3 bucket (required)
* `events` - Comma-delimited list of [S3 event types] [s3:ObjectCreated:*]

### Example

Let's run through an example to demonstrate how to receive AWS S3
change events in your OpenWhisk cluster.

If you don't already have one, create an S3 bucket in the same region
you bound to above, e.g.
    
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
subscription and S3 configuration) will be deleted, too:

    wsk trigger delete mytrigger

Enjoy! Feedback, improvements, and enhancement ideas are most welcome!


[wsk]: https://github.com/apache/incubator-openwhisk-cli/releases/
[npm]: https://www.npmjs.com/
[S3 event types]: https://docs.aws.amazon.com/AmazonS3/latest/dev/NotificationHowTo.html#supported-notification-event-types 
[SNS]: https://aws.amazon.com/sns/
[S3]: https://aws.amazon.com/s3/
[Apache OpenWhisk]: https://openwhisk.org
