
import os

file_path = r"c:\Users\nicoh\Documents\tide\web\src\app\page.tsx"
start_line = 504
end_line = 574

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Adjust for 0-based index
# start_line 504 means index 503
# end_line 574 means index 573
# We want to remove lines[503] up to lines[573] inclusive (so slice stop at 574)

if len(lines) < end_line:
    print(f"File too short: {len(lines)} lines")
    exit(1)

# print("Removing lines:")
# print("First:", lines[start_line-1])
# print("Last:", lines[end_line-1])

new_lines = lines[:start_line-1] + lines[end_line:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Successfully removed lines.")
