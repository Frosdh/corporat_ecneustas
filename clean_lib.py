"""
Remove the duplicate orphan code block (lines 3092-3182) from lib.php.
Those lines are the old get_plan_gemini body left floating outside any function,
plus an old copy of generate_local_strategic_plan signature.
We identify the block by its start marker (two blank lines then $analisis = get_analisis_experto)
right after the closing brace of the new get_plan_gemini function, and its end marker
(the line before the real generate_local_strategic_plan with the $nota param).
"""

with open('backend/lib.php', 'r', encoding='utf-8') as f:
    content = f.read()

# The orphan block starts right after the new function closes with:
# "}\n\n\n    $analisis = get_analisis_experto($sector);"
# and ends with the duplicate old function declaration:
# "function generate_local_strategic_plan(string $sector = 'general'): array"

# Identify the orphan section
ORPHAN_START = "}\n\n\n    $analisis = get_analisis_experto($sector);\n    $ia       = ia_minera_entrenar_y_analizar($sector);\n    $total    = $analisis['total'] ?? 0;\n"
ORPHAN_END   = "\nfunction generate_local_strategic_plan(string $sector = 'general'): array\n{"

idx_start = content.find(ORPHAN_START)
idx_end   = content.find(ORPHAN_END)

print(f"Orphan start position: {idx_start}")
print(f"Orphan end position:   {idx_end}")

if idx_start != -1 and idx_end != -1 and idx_start < idx_end:
    # Remove everything between the end of new function and start of generate_local_strategic_plan
    # Keep just the closing brace of get_plan_gemini and then jump to generate_local_strategic_plan
    orphan_block = content[idx_start + 1 : idx_end]  # +1 keeps the first }
    print(f"Removing {len(orphan_block)} chars of orphan code")
    print("Orphan block starts with:", repr(orphan_block[:80]))
    print("Orphan block ends with:", repr(orphan_block[-80:]))
    content = content[:idx_start + 1] + "\n\n" + content[idx_end + 1:]  # +1 skips the leading \n
    with open('backend/lib.php', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done! Orphan removed.")
else:
    print("Pattern not found exactly. Trying alternate approach...")
    # Find by line numbers
    lines = content.split('\n')
    
    # Find the line with the orphan start (first $analisis after the new get_plan_gemini closing })
    new_func_close = -1
    orphan_start_line = -1
    orphan_end_line = -1
    
    in_get_plan_gemini = False
    brace_depth = 0
    
    for i, line in enumerate(lines):
        if 'function get_plan_gemini(' in line:
            in_get_plan_gemini = True
            brace_depth = 0
        if in_get_plan_gemini:
            brace_depth += line.count('{') - line.count('}')
            if brace_depth <= 0 and in_get_plan_gemini and i > 2843:
                new_func_close = i
                in_get_plan_gemini = False
                break
    
    print(f"New get_plan_gemini closes at line {new_func_close + 1}")
    
    # After closing, find the orphan $analisis line
    for i in range(new_func_close + 1, min(new_func_close + 20, len(lines))):
        if "$analisis = get_analisis_experto" in lines[i]:
            orphan_start_line = i
            break
    
    # Find the next generate_local_strategic_plan function definition
    for i in range(orphan_start_line, len(lines)):
        if "function generate_local_strategic_plan(" in lines[i]:
            orphan_end_line = i
            break
    
    print(f"Orphan starts at line {orphan_start_line + 1}, ends at line {orphan_end_line + 1}")
    
    if orphan_start_line != -1 and orphan_end_line != -1:
        new_lines = lines[:orphan_start_line] + lines[orphan_end_line:]
        content = '\n'.join(new_lines)
        with open('backend/lib.php', 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Removed lines {orphan_start_line+1} to {orphan_end_line} ({orphan_end_line - orphan_start_line} lines)")
    else:
        print("Could not find orphan block!")
