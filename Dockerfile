FROM node:iron-bookworm AS builder

ARG PKG_VERSION
ARG GITHUB_TOKEN

WORKDIR /tmp

RUN npm i -g npm

COPY package.json .

COPY . .

# Set GitHub npm registry with authentication token
RUN sed -i.back "s|PAT|${GITHUB_TOKEN}|g" .npmrc

RUN npm config set @datasance:registry https://npm.pkg.github.com/

RUN npm i --build-from-source --force

RUN npm version $PKG_VERSION --allow-same-version --no-git-tag-version

RUN npm pack

FROM registry.access.redhat.com/ubi9/nodejs-20-minimal:9.5-1730525319

USER root
# Install dependencies for logging and development
RUN microdnf install -y logrotate g++ make && microdnf clean all

COPY logrotate.conf /etc/logrotate.conf

# Install Python and pip
RUN microdnf install -y python3 && \
    ln -sf python3 /usr/bin/python && \
    python3 -m ensurepip && \
    pip3 install --no-cache --upgrade pip setuptools && \
    microdnf install shadow-utils && \
    microdnf clean all
RUN useradd --uid 10000 --create-home runner
USER 10000
WORKDIR /home/runner

ENV NPM_CONFIG_PREFIX=/home/runner/.npm-global
ENV NPM_CONFIG_CACHE=/home/runner/.npm
ENV PATH=$PATH:/home/runner/.npm-global/bin

COPY --from=builder /tmp/datasance-iofogcontroller-*.tgz /home/runner/iofog-controller.tgz

ENV PID_BASE=/home/runner 

RUN npm i -g /home/runner/iofog-controller.tgz && \
  rm -rf /home/runner/iofog-controller.tgz && \
  iofog-controller config dev-mode --on

COPY LICENSE /licenses/LICENSE
LABEL org.opencontainers.image.description=controller
LABEL org.opencontainers.image.source=https://github.com/datasance/controller
LABEL org.opencontainers.image.licenses=EPL2.0
CMD [ "node", "/home/runner/.npm-global/lib/node_modules/@datasance/iofogcontroller/src/server.js" ]
