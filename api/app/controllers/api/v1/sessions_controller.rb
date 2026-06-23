class Api::V1::SessionsController < ApplicationController
  allow_unauthenticated_access only: %i[show create]
  rate_limit to: 10, within: 3.minutes, only: :create,
             with: -> { render json: { error: "Too many requests. Try again later." }, status: :too_many_requests }

  def show
    session_record = Session.find_by(token: cookies.signed[:session_token])
    if session_record
      Current.session = session_record
      render json: { token: session_record.token, user: UserSerializer.render_as_hash(session_record.user) }
    else
      render json: { error: "Session expired." }, status: :unauthorized
    end
  end

  def create
    if user = User.authenticate_by(params.permit(:email_address, :password))
      start_new_session_for(user)
      render json: { token: Current.session.token, user: UserSerializer.render_as_hash(user) }, status: :created
    else
      render json: { error: "Invalid email address or password." }, status: :unauthorized
    end
  end

  def destroy
    terminate_session
    head :no_content
  end
end
