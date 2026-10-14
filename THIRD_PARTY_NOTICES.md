# Third-party notices

The Comfort Cloud client in `src/panasonic/` is a port to JavaScript of parts
of aio-panasonic-comfort-cloud (login flow, request headers, endpoints, status
reading, change requests), under the MIT license, whose notice follows. The
vectors in `test/fixtures/reference-vectors.json` were produced by running
that library (`scripts/reference-vectors.py`) and include the status answer
of its test data. The Home Assistant integration panasonic_cc (MIT, same
author) and python-panasonic-comfort-cloud (MIT) were read for the polling
pace, the entities and the constants; no code of theirs is included.

## aio-panasonic-comfort-cloud (https://github.com/sockless-coding/aio-panasonic-comfort-cloud)

```text
MIT License

Copyright (c) 2020-2025 Jimmy Everling

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
