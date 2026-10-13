#!/usr/bin/env python3
"""One mental model a day from models.wuhua.app to Telegram: the card's name, summary and link, then a quiz on it.

Each day sends the card asked least often so far (ties in a fixed shuffled order), so cards added later join the
queue without repeating earlier ones; a card's n-th send asks its n-th question. What was sent on which day is kept in
sent.json next to this script. Credentials come from ~/vps-msg.env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
Usage: models-daily.py [--dry-run] [--date YYYY-MM-DD]"""
import datetime
import hashlib
import html
import json
import os
import sys
import urllib.request

SITE = 'https://models.wuhua.app'
# The other daily practice, one tap away from the message the reader already opens every morning.
TODAY = ' · '.join(f'<a href="{url}">{name}</a>' for name, url in (('日课', 'https://learn.nickwang.xyz/#/today'), ('英语', 'https://en.wuhua.app/'),
                                                                ('法语', 'https://fr.wuhua.app/')))
ENV = os.path.expanduser('~/vps-msg.env')
SENT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sent.json')
KEYS = 'ABCD'


def credentials():
    values = {}
    with open(ENV, encoding='utf-8') as handle:
        for line in handle:
            key, sep, value = line.strip().partition('=')
            if sep and not key.startswith('#'):
                values[key.strip()] = value.strip().strip('"\'')
    return values['TELEGRAM_BOT_TOKEN'], values['TELEGRAM_CHAT_ID']


def fetch(url):
    # Cloudflare turns away urllib's default User-Agent.
    request = urllib.request.Request(url, headers={'User-Agent': 'models-daily/1 (+https://models.wuhua.app)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def load_sent():
    try:
        with open(SENT, encoding='utf-8') as handle:
            return json.load(handle)
    except FileNotFoundError:
        return {}


def pick(data, day, sent):
    """(model id, card, question) for this day; a day already sent keeps its card."""
    key = day.isoformat()
    earlier = [model for date, model in sorted(sent.items()) if date < key]
    times = {model: earlier.count(model) for model in data}
    model = sent.get(key) if sent.get(key) in data else min(data, key=lambda m: (times[m], hashlib.sha256(m.encode()).hexdigest()))
    questions = data[model]['questions']
    return model, data[model], questions[times[model] % len(questions)]


def call(token, method, payload):
    request = urllib.request.Request(f'https://api.telegram.org/bot{token}/{method}', data=json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        answer = json.load(response)
    if not answer.get('ok'):
        raise RuntimeError(f"{method}: {answer.get('description')}")
    return answer


def messages(model, card, question):
    intro = (f"<b>今日模型：{html.escape(card['name'])}</b>\n{html.escape(card['one_line'])}\n\n"
             f"<a href=\"{SITE}/m/{model}\">读整张卡</a>\n\n"
             f"今天的十分钟：{TODAY}")
    right = next(n for n, option in enumerate(question['options']) if option['correct'])
    poll = {'question': f"{question['stem']}\n{question['question']}", 'options': [option['text'] for option in question['options']],
            'type': 'quiz', 'correct_option_id': right, 'explanation': question['options'][right]['feedback']}
    # Fallback when a poll can't be sent: the options as text, the answer behind a spoiler.
    listed = '\n'.join(f"{KEYS[n]}. {html.escape(option['text'])}" for n, option in enumerate(question['options']))
    text = (f"{html.escape(question['stem'])}\n<b>{html.escape(question['question'])}</b>\n{listed}\n\n"
            f"<tg-spoiler>答案 {KEYS[right]}：{html.escape(question['options'][right]['feedback'])}</tg-spoiler>")
    return intro, poll, text


def main(argv):
    day = datetime.date.fromisoformat(argv[argv.index('--date') + 1]) if '--date' in argv else datetime.date.today()
    sent = load_sent()
    model, card, question = pick(fetch(f'{SITE}/questions.json'), day, sent)
    intro, poll, text = messages(model, card, question)
    if '--dry-run' in argv:
        print(day, model, '\n' + intro + '\n', json.dumps(poll, ensure_ascii=False, indent=1))
        return
    token, chat = credentials()
    call(token, 'sendMessage', {'chat_id': chat, 'text': intro, 'parse_mode': 'HTML', 'disable_web_page_preview': True})
    try:
        call(token, 'sendPoll', {'chat_id': chat, **poll})
    except Exception as error:   # noqa: BLE001 — any refusal falls back to plain text
        print('poll failed, sent as text:', error, file=sys.stderr)
        call(token, 'sendMessage', {'chat_id': chat, 'text': text, 'parse_mode': 'HTML'})
    sent[day.isoformat()] = model
    with open(SENT + '.tmp', 'w', encoding='utf-8') as handle:
        json.dump(sent, handle, ensure_ascii=False, indent=1)
    os.replace(SENT + '.tmp', SENT)
    print(day, 'sent', model)


if __name__ == '__main__':
    main(sys.argv[1:])
