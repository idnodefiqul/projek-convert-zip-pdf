const express = require('express');
const multer = require('multer');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const PDFDocument = require('pdfkit');
const unzipper = require('unzipper');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp'); // Menggunakan sharp asli

const app = express();

// Konfigurasi multer untuk file besar
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

// Simpan status konversi
const conversionStatus = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

app.get('/', (req, res) => {
  res.render('index');
});

app.post('/convert', upload.single('zipFile'), async (req, res) => {
  const conversionId = uuidv4();
  const zipPath = req.file.path;
  const quality = req.body.quality || 'hd';
  conversionStatus[conversionId] = { status: 'processing', pdfUrl: null, error: null };

  // Proses konversi di latar belakang
  (async () => {
    try {
      const extractPath = path.join(__dirname, 'uploads', `extracted_${conversionId}`);
      await fsPromises.mkdir(extractPath);

      // Ekstrak file ZIP
      await new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: extractPath }))
          .on('close', resolve)
          .on('error', reject);
      });

      // Ambil daftar file gambar
      const files = (await fsPromises.readdir(extractPath))
        .filter(file => /\.(jpg|jpeg|png|webp)$/i.test(file))
        .sort((a, b) => a.localeCompare(b));

      if (files.length === 0) {
        throw new Error('No supported images found in ZIP');
      }

      // Buat PDF
      const pdfName = `output_${conversionId}.pdf`;
      const pdfPath = path.join(__dirname, 'uploads', pdfName);
      const doc = new PDFDocument({ autoFirstPage: false });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Pengaturan kualitas
      const qualitySettings = {
        medium: { dpi: 100, jpegQuality: 70 },
        hd: { dpi: 150, jpegQuality: 85 },
        fullhd: { dpi: 300, jpegQuality: 95 }
      };
      const { dpi, jpegQuality } = qualitySettings[quality];

      // Ukuran halaman A4 pada DPI yang dipilih
      const pageWidth = Math.round(8.27 * dpi);
      const pageHeight = Math.round(11.69 * dpi);
      const margin = Math.round(0.2 * dpi);

      // Batasi ukuran gambar ke dimensi kecil (maks 50% lebar/tinggi halaman)
      const maxImgWidth = Math.round(pageWidth * 0.5);
      const maxImgHeight = Math.round(pageHeight * 0.5);

      for (const file of files) {
        const imgPath = path.join(extractPath, file);
        
        // Proses gambar dengan sharp
        const processedImg = await sharp(imgPath)
          .resize({
            width: maxImgWidth,
            height: maxImgHeight,
            fit: 'contain',
            withoutEnlargement: true,
            background: { r: 255, g: 255, b: 255 }
          })
          .jpeg({ quality: jpegQuality })
          .toBuffer();

        doc.addPage({ size: [pageWidth, pageHeight] });
        // Posisikan gambar di tengah halaman
        const x = (pageWidth - maxImgWidth) / 2;
        const y = (pageHeight - maxImgHeight) / 2;
        doc.image(processedImg, x, y, {
          width: maxImgWidth,
          height: maxImgHeight
        });

        await fsPromises.unlink(imgPath);
      }

      doc.end();

      await new Promise(resolve => writeStream.on('finish', resolve));

      // Bersihkan file sementara
      await fsPromises.unlink(zipPath);
      await fsPromises.rm(extractPath, { recursive: true });

      // Perbarui status
      conversionStatus[conversionId] = { status: 'completed', pdfUrl: `/uploads/${pdfName}`, error: null };
    } catch (error) {
      console.error(error);
      conversionStatus[conversionId] = { status: 'failed', pdfUrl: null, error: error.message };
    }
  })();

  res.json({ conversionId });
});

app.get('/status/:conversionId', (req, res) => {
  const status = conversionStatus[req.params.conversionId] || { status: 'notfound', pdfUrl: null, error: 'Conversion not found' };
  res.json(status);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
