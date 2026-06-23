class ApplicationController < ActionController::API
  include ActionController::Cookies
  include Authentication

  rescue_from ActiveRecord::RecordNotFound, with: :not_found

  private

    def not_found
      render json: { error: "Not found." }, status: :not_found
    end
end
