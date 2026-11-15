import re

text = open('D:/SonicFrame New/studio.html', encoding='utf-8').read()
ids = re.findall(r'id="([^"]+)"', text)
print('Total IDs:', len(ids))
for i in ids:
    print(' ', i)
