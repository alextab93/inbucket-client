require "rails_helper"
require "fileutils"

RSpec.describe "Static cache headers", type: :request do
  let(:index_path) { Rails.public_path.join("index.html") }
  let(:asset_path) { Rails.public_path.join("assets/cache-policy-test-12345678.js") }
  let(:manifest_path) { Rails.public_path.join("manifest.webmanifest") }
  let(:apple_icon_path) { Rails.public_path.join("apple-touch-icon.png") }
  let(:icon_path) { Rails.public_path.join("icons/icon-192.png") }

  around do |example|
    original_index = File.binread(index_path) if File.exist?(index_path)
    original_manifest = File.binread(manifest_path) if File.exist?(manifest_path)
    original_apple_icon = File.binread(apple_icon_path) if File.exist?(apple_icon_path)
    original_icon = File.binread(icon_path) if File.exist?(icon_path)
    FileUtils.mkdir_p(asset_path.dirname)
    FileUtils.mkdir_p(icon_path.dirname)
    File.binwrite(index_path, "<!doctype html><title>Cache policy</title>")
    File.binwrite(asset_path, "export const value = true")
    File.binwrite(manifest_path, '{"display":"standalone"}')
    File.binwrite(apple_icon_path, "png")
    File.binwrite(icon_path, "png")
    example.run
  ensure
    original_index ? File.binwrite(index_path, original_index) : FileUtils.rm_f(index_path)
    if original_manifest
      File.binwrite(manifest_path, original_manifest)
    else
      FileUtils.rm_f(manifest_path)
    end
    original_apple_icon ? File.binwrite(apple_icon_path, original_apple_icon) : FileUtils.rm_f(apple_icon_path)
    original_icon ? File.binwrite(icon_path, original_icon) : FileUtils.rm_f(icon_path)
    FileUtils.rm_f(asset_path)
  end

  it "requires the generated application shell to revalidate" do
    get "/index.html"

    expect(response).to have_http_status(:ok)
    expect(response.headers["Cache-Control"]).to eq("no-cache")
    expect(response.headers["Pragma"]).to eq("no-cache")
  end

  it "allows generated fingerprinted assets to remain immutable" do
    get "/assets/cache-policy-test-12345678.js"

    expect(response).to have_http_status(:ok)
    expect(response.headers["Cache-Control"]).to eq("public, max-age=31536000, immutable")
    expect(response.headers["Pragma"]).to be_nil
  end

  it "serves the web app manifest with revalidation and its registered media type" do
    get "/manifest.webmanifest"

    expect(response).to have_http_status(:ok)
    expect(response.media_type).to eq("application/manifest+json")
    expect(response.body).to eq('{"display":"standalone"}')
    expect(response.headers["Cache-Control"]).to eq("no-cache")
    expect(response.headers["Pragma"]).to eq("no-cache")
  end

  it "requires stable home screen icons to revalidate" do
    ["/apple-touch-icon.png", "/icons/icon-192.png"].each do |path|
      get path

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/png")
      expect(response.headers["Cache-Control"]).to eq("no-cache")
      expect(response.headers["Pragma"]).to eq("no-cache")
    end
  end
end
