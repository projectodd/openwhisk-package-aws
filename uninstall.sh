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
echo Uninstalling AWSpenWhisk \

set -x

for i in $($WSK --apihost $APIHOST --auth $AUTH action list | grep awspenwhisk | awk '{print $1}')
do
    $WSK --apihost $APIHOST --auth $AUTH action delete $i
done

$WSK --apihost $APIHOST --auth $AUTH package delete awspenwhisk

