FROM node:22-alpine AS frontend

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY frontend ./frontend
COPY vite.config.mjs ./
RUN npm run build

FROM ruby:3.4.5-alpine AS gems

WORKDIR /app

RUN apk add --no-cache build-base libpq-dev yaml-dev

COPY Gemfile Gemfile.lock ./
RUN bundle config set without "development test" && \
    bundle install && \
    bundle clean --force && \
    find /usr/local/bundle -type f \( -name '*.c' -o -name '*.h' -o -name '*.o' -o -name '*.a' \) -delete && \
    find /usr/local/bundle -type f -name '*.so' -exec strip --strip-unneeded {} + && \
    rm -rf /usr/local/bundle/gems/*/test /usr/local/bundle/gems/*/spec && \
    rm -rf /usr/local/bundle/cache /usr/local/bundle/doc

FROM ruby:3.4.5-alpine

WORKDIR /app

RUN apk add --no-cache libpq libstdc++ lua5.4 tzdata

COPY --from=gems /usr/local/bundle /usr/local/bundle
COPY Gemfile Gemfile.lock ./
COPY app ./app
COPY bin ./bin
COPY config ./config
COPY db ./db
COPY lib ./lib
COPY config.ru Rakefile ./

COPY --from=frontend /build/public ./public
RUN chmod +x bin/rails bin/rake

ENV RAILS_ENV=production \
    RAILS_LOG_TO_STDOUT=true \
    RAILS_SERVE_STATIC_FILES=true \
    PORT=3000

EXPOSE 3000
CMD ["bundle", "exec", "puma", "-C", "config/puma.rb"]
