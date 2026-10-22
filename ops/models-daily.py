#!/usr/bin/env python3
"""One mental model a day from models.wuhua.app to Telegram: the card's name, summary and link, then a quiz on it.
Then it asks the site to send the same card to the email subscribers.

The card of the day is the site's 今日一卡: the script reads /today.json?date=<UTC date>, the same pick that /today,
/feed.xml and the daily email use (src/daily.mjs), so every channel shows the same card on the same UTC day.
What was sent on which day is logged in sent.json next to this script; a day already sent is skipped unless --force.

Credentials come from ~/vps-msg.env: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID for Telegram, and optionally
MODELS_CRON_SECRET, the bearer token for /api/daily-mail (the CRON_SECRET of the Pages project, see docs/email.md).
Without MODELS_CRON_SECRET the email step is skipped. MODELS_SITE in the environment points the script at another
deployment (a preview, or `wrangler pages dev`).
Usage: models-daily.py [--dry-run] [--date YYYY-MM-DD] [--force] [--no-mail | --mail-only]"""
import datetime
import html
import json
import os
import sys
import urllib.error
import urllib.request

SITE = os.environ.get('MODELS_SITE', 'https://models.wuhua.app').rstrip('/')
# The other daily practice, one tap away from the message the reader already opens every morning.
TODAY = ' · '.join(f'<a href="{url}">{name}</a>' for name, url in (('日课', 'https://learn.nickwang.xyz/#/today'), ('英语', 'https://en.wuhua.app/'),
                                                                ('法语', 'https://fr.wuhua.app/')))
ENV = os.path.expanduser('~/vps-msg.env')
SENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sent.json')
KEYS = 'ABCD'
# Cloudflare turns away urllib's default User-Agent.
AGENT = 'models-daily/2 (+https://models.wuhua.app)'


def credentials():
    values = {}
    with open(ENV, encoding='utf-8') as handle:
        for line in handle:
            key, sep, value = line.strip().partition('=')
            if sep and not key.startswith('#'):
                values[key.strip()] = value.strip().strip('"\'')
    return values


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def load_sent():
    try:
        with open(SENT, encoding='utf-8') as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def save_sent(sent):
    with open(SENT + '.tmp', 'w', encoding='utf-8') as handle:
        json.dump(sent, handle, ensure_ascii=False, indent=1)
    os.replace(SENT + '.tmp', SENT)


def utc_today():
    return datetime.datetime.now(datetime.timezone.utc).date()


def call(token, method, payload):
    request = urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}', data=json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        answer = json.load(response)
    if not answer.get('ok'):
        raise RuntimeError(f"{method}: {answer.get('description')}")
    return answer


def messages(day):
    """The intro, the quiz poll and its plain-text fallback for one /today.json answer."""
    question = day['question']
    intro = (f"<b>今日模型：{html.escape(day['name'])}</b>\n{html.escape(day['one_line'])}\n\n"
             f"<a href=\"{html.escape(day['url'])}\">读整张卡</a>\n\n"
             f"今天的十分钟：{TODAY}")
    right = next(n for n, option in enumerate(question['options']) if option['correct'])
    poll = {'question': f"{question['stem']}\n{question['question']}", 'options': [option['text'] for option in question['options']],
            'type': 'quiz', 'correct_option_id': right, 'explanation': question['options'][right]['feedback']}
    # Fallback when a poll can't be sent: the options as text, the answer behind a spoiler.
    listed = '\n'.join(f"{KEYS[n]}. {html.escape(option['text'])}" for n, option in enumerate(question['options']))
    text = (f"{html.escape(question['stem'])}\n<b>{html.escape(question['question'])}</b>\n{listed}\n\n"
            f"<tg-spoiler>答案 {KEYS[right]}：{html.escape(question['options'][right]['feedback'])}</tg-spoiler>")
    return intro, poll, text


def send_telegram(day, values):
    intro, poll, text = messages(day)
    token, chat = values['TELEGRAM_BOT_TOKEN'], values['TELEGRAM_CHAT_ID']
    call(token, 'sendMessage', {'chat_id': chat, 'text': intro, 'parse_mode': 'HTML', 'disable_web_page_preview': True})
    try:
        call(token, 'sendPoll', {'chat_id': chat, **poll})
    except Exception as error:   # noqa: BLE001 — any refusal falls back to plain text
        print('poll failed, sent as text:', error, file=sys.stderr)
        call(token, 'sendMessage', {'chat_id': chat, 'text': text, 'parse_mode': 'HTML'})


def daily_mail(secret):
    """Ask the site to mail today's card to the subscribers; the site sends at most one broadcast per UTC day."""
    request = urllib.request.Request(f'{SITE}/api/daily-mail', data=b'{}', method='POST', headers={
        'Authorization': f'Bearer {secret}', 'Content-Type': 'application/json', 'User-Agent': AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return {'ok': False, 'status': error.code, 'body': error.read().decode('utf-8', 'replace')[:300]}


def main(argv):
    date = datetime.date.fromisoformat(argv[argv.index('--date') + 1]) if '--date' in argv else utc_today()
    key = date.isoformat()
    day = fetch(f'{SITE}/today.json?date={key}')
    if '--dry-run' in argv:
        intro, poll, _ = messages(day)
        print(key, day['id'], '\n' + intro + '\n', json.dumps(poll, ensure_ascii=False, indent=1))
        return
    values = credentials()
    failed = False
    if '--mail-only' not in argv:
        sent = load_sent()
        if key in sent and '--force' not in argv:
            print(key, 'already sent', sent[key])
        else:
            try:
                send_telegram(day, values)
                sent[key] = day['id']
                save_sent(sent)
                print(key, 'sent', day['id'])
            except Exception as error:   # noqa: BLE001 — the email still goes out; the exit code reports the failure
                print('telegram failed:', error, file=sys.stderr)
                failed = True
    # The site mails its own UTC day, so the email step runs only when the script is working on today.
    if '--no-mail' not in argv and date == utc_today():
        if values.get('MODELS_CRON_SECRET'):
            answer = daily_mail(values['MODELS_CRON_SECRET'])
            print('email:', json.dumps(answer, ensure_ascii=False))
            failed = failed or not answer.get('ok')
        else:
            print('email: skipped, no MODELS_CRON_SECRET in', ENV)
    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1:])
