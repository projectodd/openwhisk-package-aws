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
echo Installing AWSpenWhisk \

pushd $PACKAGE_HOME
npm install
zip -rq awspenwhisk.zip package.json actions/ node_modules/

set -x

$WSK --apihost $APIHOST --auth $AUTH package update awspenwhisk \
     --shared yes -a description "Openwhisk AWS Integration"
$WSK --apihost $APIHOST --auth $AUTH action update awspenwhisk/from-sns \
     --web true $PACKAGE_HOME/actions/webhook.js
$WSK --apihost $APIHOST --auth $AUTH action update awspenwhisk/feed \
     -a feed true -p region us-west-2 --kind nodejs:6 $PACKAGE_HOME/awspenwhisk.zip

popd
