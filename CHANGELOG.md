# Changelog redoubt

All notable changes to this library will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/) and this library adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 2.0.2-rc1

- Add the `host` parameter to the `listen` function to optimally bind to a host/IP. Beta feature.

## 2.0.1

- Fixed an invalid setting sfor non secure cookies.

## 2.0.0

* Rename `certs` option to `ssl` and add a `none` option to disable HTTPs.
* Add a `close` function to shut the server down.
* Expose all created servers in the `server` property.

## 1.1.0

* Update dependencies

## 1.0.2

* Fixed import statements to better work with TypeScript @PatrickSachs.

## 1.0.1

* Fixed some typos @PatrickSachs.
* Changed TypeScript to be a devDependency @PatrickSachs.

## 1.0.0

* Initial commit @PatrickSachs.