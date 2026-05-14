#!/usr/bin/env bash
set -euo pipefail

curl -s -X POST http://localhost:3333/api/reset-mocks | cat
