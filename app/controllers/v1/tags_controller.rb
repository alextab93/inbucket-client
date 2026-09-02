module V1
  class TagsController < InbucketController
    rescue_from ActiveRecord::RecordNotUnique, with: :render_tag_conflict

    def index
      render json: current_user.tags.ordered.map(&:rendered)
    end

    def create
      tag = current_user.tags.new(create_attributes)
      return render_invalid_tag(tag) unless tag.save

      render json: tag.rendered, status: :created
    end

    def update
      tag = current_user.tags.find(params.require(:id))
      return render_invalid_tag(tag) unless tag.update(update_attributes)

      render json: tag.rendered
    end

    def destroy
      current_user.tags.find(params.require(:id)).destroy!
      head :no_content
    end

    private

    def create_attributes
      { name: params.require(:name), color: params.require(:color) }
    end

    def update_attributes
      attributes = params.permit(:name, :color).to_h
      raise ActionController::ParameterMissing, :tag if attributes.empty?

      attributes
    end

    def render_invalid_tag(tag)
      status = tag.errors.of_kind?(:name, :taken) ? :conflict : :unprocessable_content
      render json: { error: "invalid_tag", fields: tag.errors.to_hash }, status:
    end

    def render_tag_conflict
      render json: { error: "invalid_tag", fields: { name: ["has already been taken"] } }, status: :conflict
    end
  end
end
