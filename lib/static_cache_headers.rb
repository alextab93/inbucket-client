class StaticCacheHeaders
  REVALIDATED_PATHS = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/apple-touch-icon.png"
  ].freeze
  PWA_ICON_PATH = %r{\A/icons/}
  ASSET_PATH = %r{\A/assets/}

  def initialize(app)
    @app = app
  end

  def call(environment)
    status, headers, body = @app.call(environment)
    if status == 200 && %w[GET HEAD].include?(environment["REQUEST_METHOD"])
      path = environment["PATH_INFO"]
      if REVALIDATED_PATHS.include?(path) || PWA_ICON_PATH.match?(path)
        headers["Cache-Control"] = "no-cache"
        headers["Pragma"] = "no-cache"
      elsif ASSET_PATH.match?(path)
        headers["Cache-Control"] = "public, max-age=31536000, immutable"
        headers.delete("Pragma")
      end
    end
    [status, headers, body]
  end
end
