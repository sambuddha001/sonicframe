import re
text = open('D:/SonicFrame New/studio.html', encoding='utf-8').read()
match = re.search(r'<select id="mood"[\s\S]*?</select>', text)
if match:
    print(match.group(0))
else:
    print('mood select not found')
