import { checkinAPI } from '../api.js';

let html5QrcodeScanner = null;

export const scannerView = {
    init(params) {
        this.bindEvents();
        // Give the DOM a moment to render before starting camera
        setTimeout(() => this.startScanner(), 300);
    },
    
    bindEvents() {
        const btnFallback = document.getElementById('btn-fallback-input');
        const dialogFallback = document.getElementById('dialog-fallback');
        const btnCancelFb = document.getElementById('btn-cancel-fallback');
        const btnSubmitFb = document.getElementById('btn-submit-fallback');
        const dialogConfirm = document.getElementById('dialog-confirm');
        const btnNextScan = document.getElementById('btn-next-scan');
        
        if (btnFallback) {
            btnFallback.addEventListener('click', () => {
                this.pauseScanner();
                dialogFallback.classList.remove('hidden');
            });
        }
        
        if (btnCancelFb) {
            btnCancelFb.addEventListener('click', () => {
                dialogFallback.classList.add('hidden');
                this.resumeScanner();
            });
        }
        
        if (btnSubmitFb) {
            btnSubmitFb.addEventListener('click', () => {
                const id = document.getElementById('input-member-id').value;
                if (id) {
                    dialogFallback.classList.add('hidden');
                    this.processCheckin(id);
                }
            });
        }
        
        if (btnNextScan) {
            btnNextScan.addEventListener('click', () => {
                dialogConfirm.classList.add('hidden');
                this.resumeScanner();
            });
        }
    },
    
    startScanner() {
        if (!document.getElementById('qr-reader')) return;
        
        // Check if library loaded
        if (typeof Html5QrcodeScanner === 'undefined') {
            console.error("Html5QrcodeScanner not loaded!");
            document.getElementById('qr-result').innerHTML = '<div class="card p-4 text-center text-danger">相機載入失敗，請檢查網路連線。</div>';
            return;
        }

        html5QrcodeScanner = new Html5QrcodeScanner(
            "qr-reader", 
            { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 }, 
            /* verbose= */ false
        );
        
        html5QrcodeScanner.render(
            this.onScanSuccess.bind(this),
            this.onScanFailure.bind(this)
        );
    },
    
    pauseScanner() {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.pause(true);
        }
    },
    
    resumeScanner() {
        if (html5QrcodeScanner) {
            try {
                html5QrcodeScanner.resume();
            } catch(e) { /* ignore */ }
        }
        document.getElementById('qr-result').innerHTML = `
            <div class="card p-4 text-center">
                <p class="text-gray-500 font-medium mb-2">等待掃描...</p>
                <i class="fa-solid fa-camera text-4xl text-gray-300"></i>
            </div>
        `;
    },
    
    onScanSuccess(decodedText, decodedResult) {
        this.pauseScanner();
        // Typically QR contains ID directly or a URL with ?id=
        let memberId = decodedText;
        if (memberId.includes('?id=')) {
            const urlParams = new URLSearchParams(memberId.split('?')[1]);
            memberId = urlParams.get('id');
        } else if (memberId.includes('=')) {
            memberId = memberId.split('=').pop();
        }
        
        if (memberId) {
            this.processCheckin(memberId);
        } else {
            alert('無效的 QR Code');
            this.resumeScanner();
        }
    },
    
    onScanFailure(error) {
        // handle scan failure softly
    },
    
    async processCheckin(id) {
        const resultEl = document.getElementById('qr-result');
        resultEl.innerHTML = `
            <div class="card p-4 text-center bg-primary-light">
                <i class="fa-solid fa-spinner fa-spin text-3xl text-primary mb-2"></i>
                <p class="font-medium text-primary">報到處理中...</p>
            </div>
        `;
        
        try {
            // Write to Firebase
            await checkinAPI.markCheckin(id);
            
            document.getElementById('confirm-name').textContent = `成功報到`;
            document.getElementById('confirm-class').textContent = `ID: ${id}`;
            document.getElementById('dialog-confirm').classList.remove('hidden');
            
        } catch (err) {
            // Show Error
            resultEl.innerHTML = `
                <div class="card p-4 text-center bg-red-50 border border-red-200">
                    <i class="fa-solid fa-circle-xmark text-4xl text-danger mb-2"></i>
                    <p class="font-bold text-danger mb-1">報到失敗</p>
                    <p class="text-sm text-red-600">${err.message || '請重新掃描'}</p>
                    <button id="btn-retry" class="mt-3 px-4 py-1 text-sm bg-white border border-gray-300 rounded shadow-sm">重試</button>
                </div>
            `;
            setTimeout(() => {
                const retryBtn = document.getElementById('btn-retry');
                if(retryBtn) retryBtn.addEventListener('click', () => this.resumeScanner());
            }, 100);
        }
    }
};
