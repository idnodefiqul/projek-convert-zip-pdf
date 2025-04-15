document.getElementById('uploadForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const loading = document.getElementById('loading');
  const notification = document.getElementById('notification');
  const downloadLink = document.getElementById('downloadLink');
  
  loading.classList.remove('hidden');
  notification.classList.add('hidden');
  document.querySelector('button[type="submit"]').disabled = true;

  try {
    const response = await fetch('/convert', {
      method: 'POST',
      body: formData
    });
    const { conversionId } = await response.json();

    // Polling status konversi
    const checkStatus = async () => {
      const statusResponse = await fetch(`/status/${conversionId}`);
      const status = await statusResponse.json();

      if (status.status === 'completed') {
        loading.classList.add('hidden');
        notification.classList.remove('hidden');
        downloadLink.href = status.pdfUrl;
        document.querySelector('button[type="submit"]').disabled = false;
      } else if (status.status === 'failed') {
        loading.classList.add('hidden');
        notification.classList.remove('hidden');
        notification.innerHTML = `<p class="text-red-600 font-semibold">Error: ${status.error}</p>`;
        document.querySelector('button[type="submit"]').disabled = false;
      } else {
        setTimeout(checkStatus, 2000); // Cek lagi setelah 2 detik
      }
    };

    checkStatus();
  } catch (error) {
    loading.classList.add('hidden');
    notification.classList.remove('hidden');
    notification.innerHTML = `<p class="text-red-600 font-semibold">Error: ${error.message}</p>`;
    document.querySelector('button[type="submit"]').disabled = false;
  }
});
