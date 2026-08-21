docker network create demo

docker run \
  --name redis \
  --network demo \
  -d \
  redis:7-alpine

docker run \
  --name web \
  --network demo \
  -p 8080:80 \
  -d \
  nginx:alpine
