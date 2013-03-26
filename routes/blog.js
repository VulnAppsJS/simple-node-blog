/**
 * blog module
 */
var counters = { tags:0 };

// select all tags for selected post
function getBlogTags(blog_id, pKey, next)
{
    counters.tags++;

    // post tags
    db.q("SELECT t.* \
      FROM blog_tags bt \
      INNER JOIN tags t ON t.tag_id=bt.tag_id \
      WHERE bt.blog_id=?",
      [
        blog_id
      ], function tags(err, tags) {
        if (err) return next(err);

        counters.tags--;
        next(tags, pKey);
      }); // close post tags query
}

// update comments count for selected post
function updateCommentsCount(post_id)
{
  // update comments quant
  db.q("UPDATE blog \
    SET comments_cnt=( \
      SELECT COUNT(*) \
        FROM comments \
        WHERE post_id=?) \
    WHERE blog_id=?",
    [
      post_id,
      post_id
    ]);
}

// get page list with posts
exports.blogList = function(req, res, next)
{
    // page id
    try{
        check(req.params.page_id).is(/^[0-9]+$/);
        page_id=req.params.page_id;

    }catch(e){
        page_id=0;
    }

    // tag id
    try{
        check(req.params.tag_id).is(/^[0-9]+$/);
        tag_id=req.params.tag_id;

    }catch(e){
        tag_id=0;
    }

    // posts on page quantity
    page_size = 5;

    if (tag_id != 0)
        searchByTag = "INNER JOIN blog_tags bt ON bt.blog_id=b.blog_id AND bt.tag_id=" + tag_id;
    else
        searchByTag = "";

    db.q("SELECT SQL_CALC_FOUND_ROWS b.*\
      FROM blog  b \
      " + searchByTag + " \
      WHERE b.visible=1 \
      ORDER BY b.blog_id DESC \
      LIMIT ?, ?",
      [
        page_id*page_size,
        page_size
      ], function(err, qres) {
        if (err) return next(err);

        // wrong page no posts
        if(qres.length<=0 && page_id>=0) {
            res.redirect('/404/');
          return;
        }

        // rows quant count
        db.foundRows(function(err, cnt){
          if (err) return next(err);

            for(i in qres)
            {
                getBlogTags(qres[i].blog_id, i, function(tags, pKey){
                    qres[pKey].tags = tags;

                    // render blog page
                    if(counters.tags == 0)
                    {
                        res.render('blog_list', {
                            title: 'cocainum shoo shooo',
                            posts: qres ,
                            pager_cnt: cnt, // total posts quant
                            pager_size: page_size, // page size, posts on page
                            pager_current: page_id, // current page
                            tag_id: tag_id, // current tag
                            tags_line: req.tags_line // all tags array
                        });
                    }
                });
            }
        });
      });
}

// comments for post
function getPostComments(post_id, next)
{
  db.q("SELECT c.*, u.name \
    FROM comments c \
    INNER JOIN users u ON u.user_id=c.user_id \
    WHERE post_id=? \
    ORDER BY c.comment_id ASC",
    [
      post_id
    ], function(err, comments) {
      if (err) return next(err);

      next(err, comments);
    });
}

// delete one comment
exports.delComment = function(req, res, next)
{
  try{

    check(req.params.comment_id).is(/^[0-9]+$/);
    comment_id = req.params.comment_id;
  }catch(e){

    comment_id = 0;
  }

  db.getRow("SELECT * \
    FROM comments \
    WHERE comment_id=?",
    [
      comment_id
    ], function(err, comment){
      if (err) return next(err);

      if(comment)
      {
        // if curren user is owner of comment or admin
        if( comment.user_id == req.userInfo.user_id || req.userInfo.role == 'admin')
        {
          db.q("DELETE \
            FROM comments \
            WHERE comment_id=?",
            [
              comment_id
            ], function(err, qres){
              if (err) return next(err);

                // count comments count for post, async
                updateCommentsCount(comment.post_id);
                return res.redirect('back');
          });
        } else {
          return res.redirect('back');
        }
      } else {
        return res.redirect('back');
      }
    });
}

// one blog post
exports.blogPost = function(req, res, next)
{
    try{
        check(req.params.post_id).is(/^[0-9]+$/);
        post_id=req.params.post_id;
    }catch(e){
        post_id=0;
    }

    db.getRow("SELECT b.* \
        FROM blog b \
        WHERE blog_id=?",
        [post_id],
        function sres(err, post){

          if (err) return next(err);

          // wrong page no posts
          if(!post) {
            return res.redirect('/404');
          }

          // navigation cookie for redirect after auth
          res.cookie('back_after_auth', req.path);

          // post tags
          db.q("SELECT t.* \
            FROM blog_tags bt \
            INNER JOIN tags t ON t.tag_id=bt.tag_id \
            WHERE bt.blog_id=?",
            [
              post.blog_id
            ], function(err, tags) {
              if (err) return next(err);

              getPostComments(post.blog_id, function(err, comments){
                if (err) return next(err);

                // render post page
                res.render('blog_post',{
                  title: post.header,
                  post: post,
                  host: req.headers.host,
                  tags: tags,
                  comments: comments
                });
              });
            }); // close post tags query
        }); // close post db query
}

// tags in header
exports.tagsLine = function(req, res, next)
{
    db.q("SELECT t.*\
        FROM tags t \
        INNER JOIN blog_tags bt ON bt.tag_id=t.tag_id \
        GROUP BY t.tag_id \
        ORDER BY tag_name",
        function(err, tags) {
          if (err) return next(err);

          req.tags_line = tags;
          next();
        });
}

// add comment
exports.newComment = function(req, res)
{
  // post_id
  try{
    check(req.body.post_id).is(/^[0-9]+$/);
  }catch(e){
    req.body.post_id=0;
  }

  if(req.userInfo.auth == 1)
  {

    db.getRow("SELECT * \
      FROM blog \
      WHERE blog_id=?",
      [
        req.body.post_id
      ], function(err, post){
        if (err) return next(err);

        if (post)
        {
          db.q("INSERT comments \
            SET post_id=?, user_id=?, pub_date=NOW(), text=?",
            [
              req.body.post_id,
              req.userInfo.user_id,
              req.body.text
            ], function(err, res){
              if (err) return next(err);

              // count commets count for post, async
              updateCommentsCount(post.blog_id);

              db.lastId(function(err, commentId){
                if (err) return next(err);

                // send email
                if (appConfig.send_comment_notice && appConfig.comment_notice_email) {
                  var Email = require('email').Email;
                  new Email(
                    { from: "noreply@" + req.headers.host,
                      to: appConfig.comment_notice_email,
                      subject: "Новый комментарий #" + commentId,
                      body: "Пользователь " + req.userInfo.name +
                        " оставил новый комментарий в блоге: http://" +
                        req.headers.host+ "/post/" + post.blog_id + "/"
                    }).send(function(err){
                      // gag for errors
                      console.log('cant send email now for comment #' + commentId);
                    });
                }
              }); // last id
          }); // get comments
        }

      });
  }

  // go back
  if(req.body.post_id>0) {
    res.redirect('/post/' +req.body.post_id+ '/');
    return;
  } else {
    res.redirect('/');
    return;
  }

}

exports.blogPostsList = function(req, res, next)
{
    db.q("SELECT b.*\
        FROM blog  b\
        WHERE b.visible=1 \
        ORDER BY b.blog_id DESC",
        function(err, qres) {
          if (err) return next(err);

          res.render('blog_posts_list', {
              title: 'cocainum full list of notes',
              posts: qres
          });
        });
}
