# AWSpenWhisk

Integrating AWS with OpenWhisk

## Installation

Assumptions:

* You've cloned this repo
* [wsk](https://github.com/apache/incubator-openwhisk-cli/releases/)
  is in your path and configured with the proper `--apihost` and
  `--auth` properties.
* [npm](https://www.npmjs.com/) and `zip` are installed

With that, simply run:

    ./install.sh 

## Configuration

You'll need to bind the package to your AWS creds:

    wsk package bind aws myaws \
        -p region us-east-1 \
        -p accessKeyId YOUR_ACCESS_KEY_ID \
        -p secretAccessKey YOUR_SECRET_ACCESS_KEY
    wsk package get myaws --summary

## S3 Notifications

Let's run through an example to demonstrate how to respond to AWS S3
change events in your OpenWhisk cluster.

If you don't already have one, create an S3 bucket in the same region
you bound to above, e.g.
    
    aws s3 mb s3://mybucket --region us-east-1

Now create a trigger referencing that bucket:

    wsk trigger create mytrigger --feed myaws/events -p bucket mybucket

Now create a rule that will invoke the system `echo` action to capture
the S3 event in an activation.

    wsk rule create myrule mytrigger /whisk.system/utils/echo
    
That's it! Now any time you write an object to your bucket, you should
see the `from-sns` webhook fire `mytrigger`, thereby invoking the
`echo` action.

Wait for activations in a separate terminal:

    wsk activation poll
    
Now put something in your bucket!

    >test-file
    aws s3 cp test-file s3://mybucket

Hopefully, you'll see some activations spit out. That last one should
contain your S3 notification:

    wsk activation list -l 1 -f

If you explore your AWS console, you'll see some SNS topics
corresponding to your triggers. The subscriptions associated with
those topics need to be able to access your OpenWhisk cluster over the
Internet in order to invoke their webhooks. 

When you delete your triggers, the associated AWS resources (SNS
topics, subscriptions and S3 configuration) should go away as well.

Enjoy! Feedback is always welcome!
