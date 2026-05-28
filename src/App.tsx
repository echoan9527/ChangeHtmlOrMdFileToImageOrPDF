import React, { useState, useRef, useMemo } from 'react';
import { Camera, Download, FileJson, FileText, Image as ImageIcon, Loader2, Link2, Settings2, Globe, FileCode, UploadCloud, Edit3 } from 'lucide-react';
import { CaptureRequest } from './types.ts';
import { translations, Language } from './translations.ts';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export default function App() {
  const [lang, setLang] = useState<Language>('zh');
  const t = translations[lang];

  const [inputMode, setInputMode] = useState<'url' | 'html' | 'md'>('url');
  const [htmlFileName, setHtmlFileName] = useState<string | null>(null);
  const [mdFileName, setMdFileName] = useState<string | null>(null);
  const [mdContent, setMdContent] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);

  const [request, setRequest] = useState<CaptureRequest>({
    url: '',
    htmlContent: '',
    format: 'png',
    fullPage: true,
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    pdfMargin: '0px',
  });
  
  const [captureType, setCaptureType] = useState<'full' | 'visible' | 'selector'>('full');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const livePreviewHtml = useMemo(() => {
    if (inputMode === 'url') return '';
    if (inputMode === 'html') return request.htmlContent;
    if (inputMode === 'md' && mdContent) {
      try {
        const rawHtml = marked.parse(mdContent, { async: false }) as string;
        const cleanHtml = DOMPurify.sanitize(rawHtml);
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
    <style>
        body { margin: 0; background-color: #fff; }
        .markdown-body { padding: 45px; }
        @media (max-width: 767px) { .markdown-body { padding: 15px; } }
    </style>
</head>
<body>
    <article class="markdown-body">
        ${cleanHtml}
    </article>
</body>
</html>`;
      } catch {
        return '';
      }
    }
    return '';
  }, [inputMode, request.htmlContent, mdContent]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (inputMode === 'html') {
        handleFileSelect(e.dataTransfer.files[0]);
      } else if (inputMode === 'md') {
        handleMdFileSelect(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleMdFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleMdFileSelect(e.target.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.html') && file.type !== 'text/html') {
      setError(t.invalidHtml);
      return;
    }
    setError(null);
    setHtmlFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRequest(prev => ({ ...prev, htmlContent: content }));
    };
    reader.readAsText(file);
  };

  const handleMdFileSelect = (file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && file.type !== 'text/markdown') {
      // Allow it anyway for plain text, but might warn. Just read it as text.
    }
    setError(null);
    setMdFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setMdContent(content);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'url' && !request.url) return;
    if (inputMode === 'html' && !request.htmlContent) return;
    if (inputMode === 'md' && !mdContent) return;

    setLoading(true);
    setError(null);
    setResultUrl(null);
    
    let submitUrl = request.url;
    if (inputMode === 'url' && submitUrl && !submitUrl.startsWith('http://') && !submitUrl.startsWith('https://')) {
        submitUrl = 'https://' + submitUrl;
    }

    let finalHtmlContent = inputMode === 'html' ? request.htmlContent : undefined;
    
    if (inputMode === 'md') {
      try {
        const rawHtml = await marked.parse(mdContent);
        const cleanHtml = DOMPurify.sanitize(rawHtml);
        finalHtmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
    <style>
        body {
            margin: 0;
            background-color: #fff;
        }
        .markdown-body {
            box-sizing: border-box;
            min-width: 200px;
            max-width: 980px;
            margin: 0 auto;
            padding: 45px;
        }
        @media (max-width: 767px) {
            .markdown-body {
                padding: 15px;
            }
        }
    </style>
</head>
<body>
    <article class="markdown-body">
        ${cleanHtml}
    </article>
</body>
</html>`;
      } catch (err) {
        setError('Failed to parse Markdown.');
        setLoading(false);
        return;
      }
    }

    const payload = {
      ...request,
      url: inputMode === 'url' ? submitUrl : undefined,
      htmlContent: finalHtmlContent,
      fullPage: captureType === 'full',
      selector: captureType === 'selector' ? request.selector : undefined,
    };

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setResultUrl(objectUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `screenshot-${new Date().getTime()}.${request.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6 md:p-12 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex bg-white rounded-md shadow-sm border border-gray-200 p-1">
        <button 
          onClick={() => setLang('zh')}
          className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${lang === 'zh' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          中文
        </button>
        <button 
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${lang === 'en' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          EN
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 md:mt-0">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-5 space-y-6">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-3">
              <Camera className="w-8 h-8 text-blue-600" />
              {t.title}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {t.subtitle}
            </p>
          </header>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Input Mode Selector */}
              <div className="flex p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  {t.liveUrl}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('html')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'html' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  {t.localHtml}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('md')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'md' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  {t.markdown}
                </button>
              </div>

              {/* Input Area */}
              {inputMode === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.websiteUrl}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Link2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required={inputMode === 'url'}
                      placeholder="example.com"
                      value={request.url}
                      onChange={(e) => setRequest({ ...request, url: e.target.value })}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none transition-shadow"
                    />
                  </div>
                </div>
              )}
              
              {inputMode === 'html' && (
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.uploadHtml}
                  </label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      htmlFileName ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".html,text/html" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileInput}
                    />
                    <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${htmlFileName ? 'text-blue-500' : 'text-gray-400'}`} />
                    {htmlFileName ? (
                      <p className="text-sm font-medium text-blue-700">{htmlFileName}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900">{t.clickToUpload}</p>
                        <p className="text-xs text-gray-500 mt-1">{t.singleHtmlFile}</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {inputMode === 'md' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {/* @ts-ignore */}
                    {t.uploadMarkdown || 'Upload or Paste Markdown'}
                  </label>
                  
                  <div className="space-y-3">
                    <textarea
                      placeholder="# Markdown Title&#10;&#10;Write some markdown here or upload a file below..."
                      value={mdContent}
                      onChange={(e) => setMdContent(e.target.value)}
                      className="block w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none font-mono min-h-[120px] resize-y"
                    />
                    <div 
                      onClick={() => mdFileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        mdFileName ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                      }`}
                    >
                      <input 
                        type="file" 
                        accept=".md,.markdown,text/markdown" 
                        className="hidden" 
                        ref={mdFileInputRef}
                        onChange={handleMdFileInput}
                      />
                      <FileText className={`w-6 h-6 mx-auto mb-1 ${mdFileName ? 'text-blue-500' : 'text-gray-400'}`} />
                      {mdFileName ? (
                        <p className="text-sm font-medium text-blue-700">{mdFileName}</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900">
                            {/* @ts-ignore */}
                            {t.clickToUpload}
                          </p>
                          <p className="text-xs text-gray-500">
                            {/* @ts-ignore */}
                            {t.singleMdFile || 'Supports .md file'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t.outputFormat}</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['png', 'jpeg', 'pdf'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setRequest({ ...request, format: fmt })}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm uppercase tracking-wide font-medium transition-colors ${
                        request.format === fmt
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {fmt === 'pdf' ? <FileText className="w-5 h-5 mb-1" /> : <ImageIcon className="w-5 h-5 mb-1" />}
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Capture Type */}
              {request.format !== 'pdf' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.captureRegion}</label>
                  <div className="space-y-2">
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'full'}
                        onChange={() => setCaptureType('full')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className="text-sm font-medium">{t.fullPage}</span>
                        <span className="text-xs text-gray-500 mt-0.5">{t.fullPageDesc}</span>
                      </div>
                    </label>
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'visible'}
                        onChange={() => setCaptureType('visible')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className="text-sm font-medium">{t.visibleViewport}</span>
                        <span className="text-xs text-gray-500 mt-0.5">{t.visibleViewportDesc}</span>
                      </div>
                    </label>
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'selector'}
                        onChange={() => setCaptureType('selector')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col w-full">
                        <span className="text-sm font-medium">{t.customSelector}</span>
                        <span className="text-xs text-gray-500 mt-0.5 mb-1">{t.customSelectorDesc}</span>
                        {captureType === 'selector' && (
                          <input
                            type="text"
                            placeholder=".article-content, #main-header"
                            value={request.selector || ''}
                            onChange={(e) => setRequest({ ...request, selector: e.target.value })}
                            className="mt-2 block w-full px-3 py-2 border border-gray-200 rounded-md sm:text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* PDF Advanced Settings */}
              {request.format === 'pdf' && (
                <div className="space-y-4">
                  {/* PDF Margin Settings */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.pdfMargin}</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: '0px', label: t.pdfMarginNone },
                        { value: '20px', label: t.pdfMarginStandard },
                        { value: '40px', label: t.pdfMarginLarge }
                      ].map((margin) => (
                        <button
                          key={margin.value}
                          type="button"
                          onClick={() => setRequest({ ...request, pdfMargin: margin.value })}
                          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                            request.pdfMargin === margin.value
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {margin.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.pdfBreakAvoidSelectors}</label>
                    <input
                      type="text"
                      placeholder=".card, .article-section"
                      value={request.pdfBreakAvoidSelectors || ''}
                      onChange={(e) => setRequest({ ...request, pdfBreakAvoidSelectors: e.target.value })}
                      className="block w-full px-3 py-2 border border-gray-200 rounded-md sm:text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t.pdfBreakAvoidSelectorsDesc}</p>
                  </div>
                </div>
              )}

              {/* Viewport Settings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> {t.viewportResolution}
                </label>
                <div className="flex gap-4">
                  <div className="flex-1 border border-gray-200 rounded-md flex items-center">
                    <span className="pl-3 text-gray-500 text-sm">{t.width}</span>
                    <input
                      type="number"
                      value={request.width}
                      onChange={(e) => setRequest({ ...request, width: parseInt(e.target.value) || 1920 })}
                      className="block w-full px-3 py-2 bg-transparent sm:text-sm outline-none"
                    />
                  </div>
                  <div className="flex-1 border border-gray-200 rounded-md flex items-center">
                    <span className="pl-3 text-gray-500 text-sm">{t.height}</span>
                    <input
                      type="number"
                      value={request.height}
                      onChange={(e) => setRequest({ ...request, height: parseInt(e.target.value) || 1080 })}
                      className="block w-full px-3 py-2 bg-transparent sm:text-sm outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t.simulatedBrowserSize}</p>
              </div>

              {/* Image Quality */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t.imageQuality}</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 1, label: t.qualityStandard },
                    { value: 2, label: t.qualityHigh },
                    { value: 3, label: t.qualityUltra }
                  ].map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setRequest({ ...request, deviceScaleFactor: level.value })}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        request.deviceScaleFactor === level.value
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || (inputMode === 'url' ? !request.url : !request.htmlContent)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t.capturing}
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    {t.capture} {request.format.toUpperCase()}
                  </>
                )}
              </button>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-7 bg-white p-2 rounded-2xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{t.preview}</h2>
            <button
               onClick={handleDownload}
               disabled={!resultUrl}
               className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              {t.download}
            </button>
          </div>
          
          <div className="flex-1 bg-gray-100/50 rounded-b-xl flex items-center justify-center p-4 overflow-auto relative">
            {!resultUrl && !loading && !livePreviewHtml && (
              <div className="text-center text-gray-400">
                <ImageIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>{t.placeholderPreview}</p>
              </div>
            )}

            {!resultUrl && !loading && livePreviewHtml && (
              <div className="absolute inset-0 bg-white m-4 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <iframe 
                    srcDoc={livePreviewHtml}
                    className="w-full h-full border-none"
                    title="Live Preview"
                    sandbox="allow-same-origin allow-scripts"
                 />
              </div>
            )}
            
            {loading && (
               <div className="text-center text-blue-600">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-medium animate-pulse">{t.rendering}</p>
                  <p className="text-xs text-black/50 mt-2">{t.renderingWait}</p>
               </div>
            )}

            {resultUrl && !loading && (
              request.format === 'pdf' ? (
                 <div className="text-center py-10">
                   <FileText className="w-20 h-20 text-red-500 mx-auto mb-4" />
                   <h3 className="text-lg font-medium text-gray-900 mb-2">{t.pdfReady}</h3>
                   <p className="text-sm text-gray-500 mb-6">{t.pdfNoPreview}</p>
                   <button
                     onClick={handleDownload}
                     className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                   >
                     <Download className="w-4 h-4" />
                     {t.downloadPdf}
                   </button>
                 </div>
              ) : (
                <img 
                  src={resultUrl} 
                  alt="Captured webpage" 
                  className="max-w-full drop-shadow-md rounded-sm bg-white"
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
