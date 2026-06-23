module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_authentication
  end

  class_methods do
    def allow_unauthenticated_access(**options)
      skip_before_action :require_authentication, **options
    end
  end

  private

    def authenticated?
      resume_session
    end

    def require_authentication
      resume_session || request_authentication
    end

    def resume_session
      Current.session ||= find_session_by_token
    end

    def find_session_by_token
      token = request.headers["Authorization"]&.sub(/\ABearer\s+/, "")
      Session.find_by(token: token) if token
    end

    def request_authentication
      render json: { error: "Unauthenticated." }, status: :unauthorized
    end

    def start_new_session_for(user)
      user.sessions.create!(
        token: SecureRandom.urlsafe_base64(32),
        user_agent: request.user_agent,
        ip_address: request.remote_ip
      ).tap do |session|
        Current.session = session
        cookies.signed[:session_token] = {
          value: session.token,
          httponly: true,
          secure: Rails.env.production?,
          same_site: :lax,
          expires: 30.days.from_now
        }
      end
    end

    def terminate_session
      Current.session.destroy
      cookies.delete(:session_token)
    end

    def require_admin
      render json: { error: "Forbidden." }, status: :forbidden unless Current.user&.admin?
    end
end
