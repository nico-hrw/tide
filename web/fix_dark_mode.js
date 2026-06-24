const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src');

const mappings = {
    'bg-white': 'bg-white dark:bg-slate-900',
    'bg-gray-50': 'bg-gray-50 dark:bg-slate-800/50',
    'bg-gray-100': 'bg-gray-100 dark:bg-slate-800',
    'bg-gray-200': 'bg-gray-200 dark:bg-slate-700',
    'text-gray-900': 'text-gray-900 dark:text-slate-100',
    'text-gray-800': 'text-gray-800 dark:text-slate-200',
    'text-gray-700': 'text-gray-700 dark:text-slate-300',
    'text-gray-600': 'text-gray-600 dark:text-slate-400',
    'text-gray-500': 'text-gray-500 dark:text-slate-400',
    'text-gray-400': 'text-gray-400 dark:text-slate-500',
    'border-gray-100': 'border-gray-100 dark:border-slate-800',
    'border-gray-200': 'border-gray-200 dark:border-slate-700',
    'border-gray-300': 'border-gray-300 dark:border-slate-600',
    'hover:bg-gray-50': 'hover:bg-gray-50 dark:hover:bg-slate-800',
    'hover:bg-gray-100': 'hover:bg-gray-100 dark:hover:bg-slate-700',
    'hover:bg-gray-200': 'hover:bg-gray-200 dark:hover:bg-slate-600',
    'hover:bg-white': 'hover:bg-white dark:hover:bg-slate-800',
    'divide-gray-100': 'divide-gray-100 dark:divide-slate-800',
    'ring-gray-200': 'ring-gray-200 dark:ring-slate-700',
    'text-black': 'text-black dark:text-white',
    'border-black': 'border-black dark:border-slate-600'
};

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    
    for (const [light, darkReplacement] of Object.entries(mappings)) {
        const escapedLight = light.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const escapedDarkVariant = darkReplacement.split(' ')[1].replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        
        const boundaryRegex = new RegExp(`(?<=['"\\\\s\`\\[\\]])(${escapedLight})(?=['"\\\\s\`\\[\\]])`, 'g');
        
        content = content.replace(boundaryRegex, (match, p1, offset, string) => {
            const lookahead = string.substring(offset, offset + 150);
            if (lookahead.includes(darkReplacement.split(' ')[1])) {
                return match; 
            }
            return darkReplacement;
        });
    }

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${filePath}`);
    }
}

function traverseDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            traverseDirectory(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    }
}

traverseDirectory(directoryPath);
console.log('Done mapping tailwind classes!');
