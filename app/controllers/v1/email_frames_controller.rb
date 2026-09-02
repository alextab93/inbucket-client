module V1
  class EmailFramesController < ApplicationController
    before_action :require_session!

    def show
      image_sources = params[:remote_images] == "true" ? "'self' data: http: https:" : "'self' data:"
      response.headers["Content-Security-Policy"] = [
        "default-src 'none'",
        "script-src 'none'",
        "object-src 'none'",
        "frame-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        "style-src 'unsafe-inline'",
        "img-src #{image_sources}"
      ].join("; ")
      response.headers["Referrer-Policy"] = "no-referrer"
      response.headers["X-Content-Type-Options"] = "nosniff"
      render body: frame_document, content_type: "text/html"
    end

    private

    def frame_document
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>html,body{margin:0;padding:0;background:transparent}body{overflow-wrap:anywhere}</style></head><body></body></html>'
    end
  end
end
