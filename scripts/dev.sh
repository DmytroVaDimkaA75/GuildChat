#!/usr/bin/env bash
#
# Запуск сервера розробки для телефона.
#
# У GitHub Codespace телефон не може достукатись до localhost, а тунель
# ngrok нестабільний і дає щоразу нову адресу. Тому тут використовується
# власна постійна адреса Codespace на порт 8081:
#
#     exp://<codespace>-8081.app.github.dev
#
# Вона не міняється, поки живий Codespace. Порт робиться публічним
# автоматично (одноразовий дозвіл GitHub).
#
# Поза Codespace — звичайний тунель.

set -euo pipefail

if [ -z "${CODESPACE_NAME:-}" ]; then
  echo "Не Codespace — запускаю через тунель…"
  exec npx expo start --dev-client --tunnel
fi

HOST="${CODESPACE_NAME}-8081.app.github.dev"
export EXPO_PACKAGER_PROXY_URL="https://${HOST}"

# У фоні: щойно порт підніметься — зробити його публічним і показати адресу.
(
  for _ in $(seq 1 40); do
    if curl -s -o /dev/null -m 2 "http://localhost:8081"; then
      gh codespace ports visibility 8081:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
      printf '\n\033[1;32m✅ Постійна адреса для телефона:\033[0m\n'
      printf '   exp://%s\n\n' "$HOST"
      printf '   Введіть її в застосунку FoEChat Development Build (поле адреси)\n'
      printf '   один раз — і більше не міняється.\n\n'
      break
    fi
    sleep 2
  done
) &

exec npx expo start --dev-client
