#!/bin/sh
NS=$(awk '/^nameserver/ { if ($2 ~ /:/) print "[" $2 "]"; else print $2 }' /etc/resolv.conf | tr '\n' ' ')
[ -z "$NS" ] && NS="127.0.0.11"
echo "resolver ${NS} valid=5s;" > /etc/nginx/resolver.conf
