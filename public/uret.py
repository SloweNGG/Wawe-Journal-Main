import csv, random, datetime

base = datetime.datetime(2026, 1, 1, 9, 0)

with open('test1500.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['symbol', 'direction', 'lot', 'entry', 'exit', 'date'])
    for i in range(1500):
        d = base + datetime.timedelta(minutes=17 * i)
        e = round(random.uniform(100, 200), 2)
        w.writerow([
            'BTCUSDT',
            random.choice(['Long', 'Short']),
            1,
            e,
            round(e + random.uniform(-5, 5), 2),
            d.strftime('%Y-%m-%d %H:%M:%S'),
        ])

print('test1500.csv hazır')