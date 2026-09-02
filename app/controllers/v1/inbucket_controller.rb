module V1
  class InbucketController < ApplicationController
    before_action :require_session!

    rescue_from InbucketClient::Unavailable, with: :render_inbucket_unavailable
    rescue_from InbucketClient::InvalidResponse, with: :render_inbucket_invalid_response

    private

    def inbucket
      @inbucket ||= InbucketClient.new
    end

    def render_upstream(response, json: false)
      if json && response.status.between?(200, 299)
        render json: response.body, status: response.status
      elsif response.status == 404
        render json: { error: "not_found" }, status: :not_found
      else
        render json: { error: "inbucket_error" }, status: :bad_gateway
      end
    end

    def render_destroy_upstream(response)
      if response.status.between?(200, 299)
        head :no_content
      elsif response.status == 404
        render json: { error: "not_found" }, status: :not_found
      else
        render json: { error: "inbucket_error" }, status: :bad_gateway
      end
    end

    def render_inbucket_unavailable
      render json: { error: "inbucket_unavailable" }, status: :bad_gateway
    end

    def render_inbucket_invalid_response
      render json: { error: "inbucket_invalid_response" }, status: :bad_gateway
    end
  end
end
