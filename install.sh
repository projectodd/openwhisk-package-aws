#!/bin/bash

WSK="${1:-$(type -p wsk)}"
APIHOST="${2:-$($WSK property get --apihost | awk '{print $NF}')}"
AUTH="${3:-$($WSK property get --auth | awk '{print $NF}')}"

if [ -z "$WSK" -o -z "$APIHOST" -o -z "$AUTH" ]
then
  echo "Usage: ./install.sh <path_to_wsk> <apihost> <auth>"
  exit -1
fi

PACKAGE_HOME="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PACKAGE_NAME="aws"
WEBHOOK_ACTION="from-sns"

echo Installing $PACKAGE_NAME package

set -x

pushd $PACKAGE_HOME
npm install
zip -rq $PACKAGE_NAME.zip package.json actions/ node_modules/

$WSK --apihost $APIHOST --auth $AUTH package update $PACKAGE_NAME \
     -a description 'Amazon Web Services integration' \
     -a parameters '[{"name":"accessKeyId", "required":true, "bindTime":true, "type":"password"}, {"name":"secretAccessKey", "required":true, "bindTime":true, "type":"password"}, {"name":"region", "required":false, "bindTime":true}]' \
     --shared yes -p region us-west-2
$WSK --apihost $APIHOST --auth $AUTH action update $PACKAGE_NAME/$WEBHOOK_ACTION \
     -a description 'The webhook invoked by the AWS SNS subscription' \
     --web true $PACKAGE_HOME/actions/webhook.js
$WSK --apihost $APIHOST --auth $AUTH action update $PACKAGE_NAME/events \
     -a description 'Feed that creates an SNS topic to receive S3 bucket events' \
     -a parameters '[{"name":"topicArn", "required":false, "description":"The address of an existing SNS topic for the feed"}, {"name":"bucket", "required":false, "description":"The name of the AWS S3 bucket"}, {"name":"events", "required":false, "description":"The type of S3 events [s3:ObjectCreated:*]"}]' \
     -p events "s3:ObjectCreated:*" \
     -a sampleInput '{"bucket":"myBucket", "events": "s3:ObjectCreated:Put, s3:ObjectCreated:Post, s3:ObjectCreated:Copy, s3:ObjectRemoved:*"}' \
     -a feed true -p webhookAction $WEBHOOK_ACTION \
     --kind nodejs:6 $PACKAGE_HOME/$PACKAGE_NAME.zip

popd
