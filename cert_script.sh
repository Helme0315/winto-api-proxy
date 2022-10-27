#!/bin/bash

DIR=$1
KEYDIR=$2

copy_latest () {
    STATIC_FILENAME=$1'.pem'
    OFFSET=${#1}
    LATEST_FILE=''
    HIGHEST_NUM=0
    FILES=$(ls -l $DIR | grep -v total | grep '.pem')
    for line in $FILES; do
        FILE=$(echo $line | grep -oE '[^ ]+$')
        if [ ${FILE:0:OFFSET} == $1 ]; then
            TMP=${FILE:OFFSET}
            NUM=${TMP:0:-4}
            if [ $((NUM)) -gt $HIGHEST_NUM ]; then
                LATEST_FILE=$FILE
                HIGHEST_NUM=$((NUM))
            fi
        fi
    done

    if [ '$LATEST_FILE' != '' ]; then
        if [ $HIGHEST_NUM != 0 ]; then
            echo "latest file:" $LATEST_FILE
            cp $DIR/$LATEST_FILE $KEYDIR/$STATIC_FILENAME
        fi
    fi
}

PREFIXES=('cert' 'chain' 'fullchain' 'privkey')

for p in "${PREFIXES[@]}"
do
    copy_latest $p
done