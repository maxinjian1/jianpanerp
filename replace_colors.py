import os

target_dir = 'apps/web-client'
old_word = 'sakura'
new_word = 'anet'

extensions = ('.ts', '.tsx', '.js', '.jsx', '.css')

print(f"Replacing '{old_word}' with '{new_word}' in {target_dir}...")

count = 0
for root, dirs, files in os.walk(target_dir):
    for file in files:
        if file.endswith(extensions):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                if old_word in content:
                    new_content = content.replace(old_word, new_word)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated: {file_path}")
                    count += 1
            except Exception as e:
                print(f"Error reading {file_path}: {e}")

print(f"Total files updated: {count}")


