import QRCode from 'qrcode';
import { ethers } from 'ethers';
import Chart from 'chart.js/auto';

const FEE_AMOUNT = 0.005; // Transaction fee in ETH
const FEE_WALLET = '0x1234567890123456789012345678901234567890'; // Replace with your fee collection wallet

class Wallet {
  constructor() {
    this.privateKey = null;
    this.address = null;
    this.balance = 0;
    this.chart = null;
    this.initializeWallet();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
        if (button.dataset.tab === 'deposit') {
          this.generateQRCode();
          this.updateUI();
        }
        if (button.dataset.tab === 'send' || button.dataset.tab === 'charts') {
          this.renderOutflowChart('monthly');
        }
      });
    });

    // Chart buttons
    const monthlyBtn = document.getElementById('monthlyChartBtn');
    const yearlyBtn = document.getElementById('yearlyChartBtn');
    if (monthlyBtn && yearlyBtn) {
      monthlyBtn.addEventListener('click', () => this.renderOutflowChart('monthly'));
      yearlyBtn.addEventListener('click', () => this.renderOutflowChart('yearly'));
    }

    // Copy address buttons
    document.getElementById('copyDepositAddress').addEventListener('click', () => {
      this.copyToClipboard(this.address);
    });

    // Send button
    document.getElementById('sendButton').addEventListener('click', async () => {
      const recipientAddress = document.getElementById('recipientAddress').value;
      const amount = document.getElementById('amount').value;
      if (!recipientAddress || !amount) {
        alert('Please fill in all fields');
        return;
      }
      try {
        await this.sendTransaction(recipientAddress, amount);
        alert('Transaction sent successfully!');
        this.renderOutflowChart('monthly');
      } catch (error) {
        alert('Transaction failed: ' + error.message);
      }
    });
  }

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      alert('Address copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }

  async initializeWallet() {
    const storedWallet = await chrome.storage.local.get(['wallet']);
    if (storedWallet.wallet) {
      this.privateKey = storedWallet.wallet.privateKey;
      this.address = storedWallet.wallet.address;
    } else {
      const wallet = ethers.Wallet.createRandom();
      this.privateKey = wallet.privateKey;
      this.address = wallet.address;
      await chrome.storage.local.set({
        wallet: {
          privateKey: this.privateKey,
          address: this.address
        }
      });
    }
    this.updateUI();
    this.loadBalance();
    this.generateQRCode();
    this.renderOutflowChart('monthly');
  }

  generateQRCode() {
    const qrCanvas = document.getElementById("qrcode");
    if (this.address && this.address.length > 0) {
      QRCode.toCanvas(qrCanvas, this.address, { width: 128 }, function (error) {
        if (error) console.error(error);
      });
    }
  }

  async loadBalance() {
    try {
      const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/QzveQtSpkHz9q0nSlv0Iv1XL_QYEWi7p');
      const balance = await provider.getBalance(this.address);
      this.balance = ethers.utils.formatEther(balance);
      this.updateUI();
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  }

  async sendTransaction(recipientAddress, amount) {
    try {
      const provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.g.alchemy.com/v2/QzveQtSpkHz9q0nSlv0Iv1XL_QYEWi7p');
      const wallet = new ethers.Wallet(this.privateKey, provider);
      const totalAmount = parseFloat(amount) + FEE_AMOUNT;
      if (this.balance < totalAmount) {
        throw new Error('Insufficient balance');
      }
      const tx = await wallet.sendTransaction({
        to: recipientAddress,
        value: ethers.utils.parseEther(amount.toString())
      });
      const feeTx = await wallet.sendTransaction({
        to: FEE_WALLET,
        value: ethers.utils.parseEther(FEE_AMOUNT.toString())
      });
      await tx.wait();
      await feeTx.wait();
      await this.loadBalance();
      this.updateTransactionHistory(tx.hash, amount, recipientAddress);
      this.renderOutflowChart('monthly');
      return tx.hash;
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  }

  updateUI() {
    // Only update deposit address in deposit tab
    document.getElementById('depositAddress').textContent = this.address;
    document.getElementById('balance').textContent = this.balance;
  }

  async updateTransactionHistory(txHash, amount, recipient) {
    const history = await chrome.storage.local.get(['transactionHistory']) || { transactionHistory: [] };
    history.transactionHistory.push({
      hash: txHash,
      amount: amount,
      recipient: recipient,
      timestamp: new Date().toISOString()
    });
    await chrome.storage.local.set({ transactionHistory: history.transactionHistory });
    this.displayTransactionHistory();
    this.renderOutflowChart('monthly');
  }

  async displayTransactionHistory() {
    const history = await chrome.storage.local.get(['transactionHistory']) || { transactionHistory: [] };
    const historyDiv = document.getElementById('transactionHistory');
    historyDiv.innerHTML = '';
    history.transactionHistory.slice(-5).forEach(tx => {
      const txElement = document.createElement('div');
      txElement.innerHTML = `
        <p>Amount: ${tx.amount} ETH</p>
        <p>To: ${tx.recipient}</p>
        <p>Time: ${new Date(tx.timestamp).toLocaleString()}</p>
        <hr>
      `;
      historyDiv.appendChild(txElement);
    });
  }

  async renderOutflowChart(type) {
    const history = await chrome.storage.local.get(['transactionHistory']);
    const txs = history.transactionHistory || [];
    const outflows = txs.filter(tx => tx.recipient !== this.address);
    let labels = [], data = [];
    if (type === 'monthly') {
      // Son 30 gün
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = `${day.getMonth() + 1}/${day.getDate()}`;
        labels.push(dayStr);
        const total = outflows.filter(tx => {
          const txDate = new Date(tx.timestamp);
          return txDate.toDateString() === day.toDateString();
        }).reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        data.push(total);
      }
    } else if (type === 'yearly') {
      // Son 12 ay
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = `${month.getFullYear()}/${month.getMonth() + 1}`;
        labels.push(monthStr);
        const total = outflows.filter(tx => {
          const txDate = new Date(tx.timestamp);
          return txDate.getFullYear() === month.getFullYear() && txDate.getMonth() === month.getMonth();
        }).reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
        data.push(total);
      }
    }
    const ctx = document.getElementById('outflowChart').getContext('2d');
    if (this.chart) this.chart.destroy();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'ETH Outflow',
          data: data,
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: {
        responsive: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}

// THEME SWITCHING LOGIC for modern toggle
function setTheme(theme) {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(theme);
  localStorage.setItem('ethut-theme', theme);
  const themeSwitch = document.getElementById('themeToggleSwitch');
  if (themeSwitch) {
    themeSwitch.classList.remove('light', 'dark');
    themeSwitch.classList.add(theme === 'dark-theme' ? 'dark' : 'light');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  // Theme
  const savedTheme = localStorage.getItem('ethut-theme') || 'light-theme';
  setTheme(savedTheme);
  const themeSwitch = document.getElementById('themeToggleSwitch');
  if (themeSwitch) {
    themeSwitch.addEventListener('click', function() {
      const current = document.body.classList.contains('dark-theme') ? 'dark-theme' : 'light-theme';
      setTheme(current === 'dark-theme' ? 'light-theme' : 'dark-theme');
    });
  }

  // Tabs: Only charts tab is active by default
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById('charts').classList.add('active');
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  // No tab-button is active by default

  const wallet = new Wallet();
}); 