document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileInfo = document.getElementById('file-info');
    const fileNameDisplay = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const generateBtn = document.getElementById('generate-btn');
    const customInstructions = document.getElementById('custom-instructions');
    const resultSection = document.getElementById('result-section');
    const summaryOutput = document.getElementById('summary-output');
    const loadingOverlay = document.getElementById('loading-overlay');
    const copyBtn = document.getElementById('copy-btn');

    let currentFile = null;

    // Allowed file types and max size (20MB)
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const ALLOWED_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'image/png',
        'image/jpeg',
        'image/jpg'
    ];

    // Event Listeners for Drag and Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    
    // Click on browse button
    browseBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Remove file
    removeFileBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        dropZone.classList.remove('hidden');
        generateBtn.disabled = true;
    });

    // Handle Drop
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length) {
            handleFile(files[0]);
        }
    }

    // Handle File Validation and UI update
    function handleFile(file) {
        // Validate type
        if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(pdf|docx|txt|png|jpe?g)$/i)) {
            alert('Invalid file type. Please upload a PDF, DOCX, TXT, PNG, or JPEG file.');
            return;
        }

        // Validate size
        if (file.size > MAX_FILE_SIZE) {
            alert('File is too large. Maximum size is 20MB.');
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = file.name;
        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        generateBtn.disabled = false;
        
        // Hide previous result
        resultSection.classList.add('hidden');
    }

    // Generate Summary
    generateBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        const formData = new FormData();
        formData.append('document', currentFile);
        formData.append('instructions', customInstructions.value.trim());

        // Show loading
        loadingOverlay.classList.remove('hidden');
        generateBtn.disabled = true;
        resultSection.classList.add('hidden');

        try {
            const response = await fetch('/api/summarize', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok && result.success) {
                displaySummary(result.summary);
            } else {
                throw new Error(result.error || 'Failed to generate summary.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        } finally {
            // Hide loading
            loadingOverlay.classList.add('hidden');
            generateBtn.disabled = false;
        }
    });

    // Simple markdown-to-html formatter for the output
    function formatSummary(text) {
        if (!text) return '';
        
        let formatted = text
            // Headers
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Bold
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            // Lists
            .replace(/^\s*\-\s(.*)/gim, '<ul><li>$1</li></ul>')
            .replace(/^\s*\*\s(.*)/gim, '<ul><li>$1</li></ul>')
            // Clean up adjacent lists
            .replace(/<\/ul>\n<ul>/gim, '')
            // Paragraphs
            .replace(/\n\n/gim, '<p></p>');

        return formatted;
    }

    function displaySummary(summary) {
        // You could use a proper markdown parser like marked.js, but since we are limited to vanilla JS:
        summaryOutput.innerHTML = formatSummary(summary);
        resultSection.classList.remove('hidden');
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }

    // Copy to clipboard
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(summaryOutput.innerText);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('btn-success'); // Custom style for success if added
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('btn-success');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
            alert('Failed to copy to clipboard.');
        }
    });
});
