        // Simple loader hide after page load
        window.addEventListener('load', function() {
            setTimeout(function() {
                document.getElementById('loader').classList.add('hidden');
                document.querySelector('main').classList.add('visible');
            }, 1500);
        });