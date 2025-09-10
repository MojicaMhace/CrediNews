// Theme Management
class ThemeManager {
    constructor() {
        this.theme = localStorage.getItem('theme') || 'light';
        this.init();
    }

    init() {
        this.applyTheme();
        this.bindEvents();
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            icon.className = this.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
    }

    bindEvents() {
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
    }
}

// Navigation Management
class NavigationManager {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.getAttribute('href').startsWith('#')) {
                    e.preventDefault();
                    this.showSection(link.getAttribute('href').substring(1));
                    this.setActiveLink(link);
                }
            });
        });
    }

    showSection(sectionId) {
        // Hide all sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });

        // Show target section
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        }
    }

    setActiveLink(activeLink) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        activeLink.classList.add('active');
    }
}

// Chart Management
class ChartManager {
    constructor() {
        this.charts = {};
        this.init();
    }

    init() {
        this.createScoreChart();
        this.createTrendCharts();
    }

    createScoreChart() {
        const ctx = document.getElementById('scoreChart');
        if (!ctx) return;

        this.charts.scoreChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [85, 15],
                    backgroundColor: [
                        getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
                        getComputedStyle(document.documentElement).getPropertyValue('--border-color')
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            }
        });
    }

    createTrendCharts() {
        this.createWeeklyTrendChart();
        this.createCategoryChart();
    }

    createWeeklyTrendChart() {
        const ctx = document.getElementById('weeklyTrendChart');
        if (!ctx) return;

        this.charts.weeklyTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Misinformation Rate (%)',
                    data: [12, 8, 15, 10, 18, 22, 14],
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--alert-danger'),
                    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--alert-danger') + '20',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 30
                    }
                }
            }
        });
    }

    createCategoryChart() {
        const ctx = document.getElementById('categoryChart');
        if (!ctx) return;

        this.charts.categoryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Politics', 'Health', 'Technology', 'Sports', 'Entertainment'],
                datasets: [{
                    label: 'Misinformation Cases',
                    data: [45, 32, 18, 12, 28],
                    backgroundColor: [
                        getComputedStyle(document.documentElement).getPropertyValue('--alert-danger'),
                        getComputedStyle(document.documentElement).getPropertyValue('--alert-warning'),
                        getComputedStyle(document.documentElement).getPropertyValue('--alert-info'),
                        getComputedStyle(document.documentElement).getPropertyValue('--secondary-color'),
                        getComputedStyle(document.documentElement).getPropertyValue('--primary-color')
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    updateScoreChart(score) {
        if (this.charts.scoreChart) {
            this.charts.scoreChart.data.datasets[0].data = [score, 100 - score];
            this.charts.scoreChart.update();
        }
    }
}

// News Analysis Manager
class NewsAnalyzer {
    constructor() {
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const checkBtn = document.getElementById('checkBtn');
        const newsInput = document.getElementById('newsInput');

        if (checkBtn) {
            checkBtn.addEventListener('click', () => this.analyzeNews());
        }

        if (newsInput) {
            newsInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    this.analyzeNews();
                }
            });
        }
    }

    analyzeNews() {
        const newsInput = document.getElementById('newsInput');
        const text = newsInput.value.trim();

        if (!text) {
            this.showError('Please enter some text to analyze.');
            return;
        }

        this.showLoading();
        
        // Simulate API call with setTimeout
        setTimeout(() => {
            this.displayResults(this.generateMockResults());
        }, 2000);
    }

    showLoading() {
        const checkBtn = document.getElementById('checkBtn');
        const originalText = checkBtn.innerHTML;
        
        checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
        checkBtn.disabled = true;

        setTimeout(() => {
            checkBtn.innerHTML = originalText;
            checkBtn.disabled = false;
        }, 2000);
    }

    showError(message) {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--alert-danger);
            color: white;
            padding: 1rem;
            border-radius: 0.5rem;
            z-index: 1000;
            animation: fadeIn 0.3s ease;
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    generateMockResults() {
        const scores = [65, 72, 85, 91, 45, 38, 78];
        const classifications = ['real', 'fake', 'uncertain'];
        const confidences = [67, 73, 85, 92, 78, 81, 89];
        
        const randomScore = scores[Math.floor(Math.random() * scores.length)];
        const randomClassification = classifications[Math.floor(Math.random() * classifications.length)];
        const randomConfidence = confidences[Math.floor(Math.random() * confidences.length)];

        return {
            score: randomScore,
            classification: randomClassification,
            confidence: randomConfidence
        };
    }

    displayResults(results) {
        // Update score
        const scoreNumber = document.getElementById('scoreNumber');
        if (scoreNumber) {
            scoreNumber.textContent = results.score;
        }

        // Update classification
        const classificationResult = document.getElementById('classificationResult');
        if (classificationResult) {
            classificationResult.className = `classification-result ${results.classification}`;
            
            const icon = classificationResult.querySelector('i');
            const text = classificationResult.querySelector('span');
            
            switch (results.classification) {
                case 'real':
                    icon.className = 'fas fa-check-circle';
                    text.textContent = 'Likely Real';
                    break;
                case 'fake':
                    icon.className = 'fas fa-times-circle';
                    text.textContent = 'Likely Fake';
                    break;
                case 'uncertain':
                    icon.className = 'fas fa-question-circle';
                    text.textContent = 'Uncertain';
                    break;
            }
        }

        // Update confidence
        const confidenceLevel = document.getElementById('confidenceLevel');
        if (confidenceLevel) {
            confidenceLevel.textContent = `${results.confidence}%`;
        }

        // Update chart
        if (window.chartManager) {
            window.chartManager.updateScoreChart(results.score);
        }

        // Show results section
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.style.display = 'grid';
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// Demo Button Handler
class DemoButtonHandler {
    constructor() {
        this.init();
    }

    init() {
        const demoBtn = document.getElementById('demoBtn');
        if (demoBtn) {
            // Add mousedown and mouseup events for better control
            demoBtn.addEventListener('mousedown', () => this.activateButton(demoBtn));
            demoBtn.addEventListener('mouseup', () => this.deactivateButton(demoBtn));
            demoBtn.addEventListener('mouseleave', () => this.deactivateButton(demoBtn));
            
            // Add touch events for mobile
            demoBtn.addEventListener('touchstart', () => this.activateButton(demoBtn));
            demoBtn.addEventListener('touchend', () => this.deactivateButton(demoBtn));
        }
    }

    activateButton(btn) {
        btn.style.background = 'var(--primary-color)';
        btn.style.color = 'white';
        btn.style.borderColor = 'var(--primary-color)';
        btn.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.4)';
        btn.style.transform = 'translateY(1px)';
    }

    deactivateButton(btn) {
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
        btn.style.borderColor = 'var(--border-color)';
        btn.style.boxShadow = 'none';
        btn.style.transform = 'translateY(0)';
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize managers
    window.themeManager = new ThemeManager();
    window.navigationManager = new NavigationManager();
    window.chartManager = new ChartManager();
    window.newsAnalyzer = new NewsAnalyzer();
    window.demoButtonHandler = new DemoButtonHandler();

    // Hide results section initially
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }

    // Hero section buttons
    const analyzeBtn = document.getElementById('analyzeBtn');
    const verifyBtn = document.getElementById('verifyBtn');
    const watchDemo = document.getElementById('watchDemo');
    
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
            document.getElementById('dashboard').classList.add('active');
        });
    }
    
    if (verifyBtn) {
        verifyBtn.addEventListener('click', () => {
            document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
            document.getElementById('dashboard').classList.add('active');
            const newsInput = document.getElementById('newsInput');
            if (newsInput) {
                newsInput.focus();
            }
        });
    }
    
    if (watchDemo) {
        watchDemo.addEventListener('click', () => {
            // Simulate demo functionality
            alert('Demo feature coming soon!');
        });
    }

    console.log('CrediNews application initialized successfully!');
});

// Handle theme changes for charts
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                // Recreate charts with new theme colors
                setTimeout(() => {
                    if (window.chartManager) {
                        window.chartManager.init();
                    }
                }, 100);
            }
        });
    });

    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
});