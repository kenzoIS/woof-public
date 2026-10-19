import sys
import re

with open('frontend/src/app/pages/AISimulation.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

blocks = re.findall(r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> origin/main\n', content, re.DOTALL)

print(f"Found {len(blocks)} blocks")

resolutions = []

# Block 0: imports
resolutions.append('''import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";''')

# Block 1: getDemandLevel
resolutions.append(blocks[1][0])

# Block 2: demand level logic
resolutions.append('''        const sampleDays = Number(column.sampleDays || (trafficValue as any)?.sampleDays || 1);
        const cumulativeVisits = Number((trafficValue as any)?.cumulativeVisits || Math.round(visits * sampleDays));
        const displayVal = trafficDisplayMode === "weekday_average" ? cumulativeVisits : visits;
        const level = getDemandLevelForSector(sector.name, displayVal);''')

# Block 3: selectedTimeStaffPlan
resolutions.append(blocks[3][0])

# Block 4: liveCostAndCapacity + maxCumulativeVisits
resolutions.append(blocks[4][0] + "\n" + blocks[4][1].split('});')[1].strip())

# Block 5: trafficPrediction
resolutions.append(blocks[5][0])

# Block 6: Active Staff badge
resolutions.append(blocks[6][0])

# Block 7: Note: Active staff
resolutions.append(blocks[7][0])

# Block 8: Traffic Heatmap per Sector title
resolutions.append(blocks[8][0])

# Block 9: Table Layout
resolutions.append(blocks[9][0])

# Block 10: Staffing Filter
resolutions.append(blocks[10][0])

# Block 11: Current scheduled coverage
resolutions.append(blocks[11][0])

if len(blocks) == len(resolutions):
    for i in range(len(blocks)):
        original_block = f'<<<<<<< HEAD\n{blocks[i][0]}\n=======\n{blocks[i][1]}\n>>>>>>> origin/main\n'
        content = content.replace(original_block, resolutions[i] + '\n')
    
    with open('frontend/src/app/pages/AISimulation.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Resolved successfully")
else:
    print(f"Mismatch: {len(blocks)} blocks, but {len(resolutions)} resolutions mapped.")
